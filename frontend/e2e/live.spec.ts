/**
 * Live UI checks: sign in through the real WSO2 login page, then confirm the
 * dashboard shows real gateway data, the analyst's real 403, the manager's
 * customer view and a real 429 from the gateway's rate limiter.
 */
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function env(): Record<string, string> {
  const text = readFileSync(join(import.meta.dirname, '..', '..', '.env'), 'utf8')
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  )
}

const SHOTS = join(import.meta.dirname, '..', 'e2e-results', 'screens')

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
  await page.getByRole('button', { name: 'Sign in with WSO2' }).click()
  // The real WSO2 API Manager login page.
  await page.waitForURL(/localhost:9443\/authenticationendpoint\/login\.do/)
  await page.getByTestId('login-page-username-input').fill(username)
  await page.getByTestId('login-page-password-input').fill(password)
  await page.locator('#loginForm button[type="submit"]').click()
  // First sign-in per user shows WSO2's consent page once.
  const approve = page.locator('#approve')
  await page.waitForURL(/(oauth2_consent\.do|localhost:5173\/overview)/)
  if (await approve.isVisible()) await approve.click()
  await page.waitForURL(/localhost:5173\/overview/)
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  // WSO2's OIDC logout may ask for confirmation before ending the session.
  await page.waitForURL(/(localhost:5173|oidc\/logout|authenticationendpoint)/)
  const consent = page.getByRole('button', { name: /^Yes$/ })
  if (await consent.isVisible().catch(() => false)) await consent.click()
  await page.waitForURL(/localhost:5173\/signin/)
}

test('analyst sees real data but gets a real 403 on customer lookup', async ({ page }) => {
  const { ANALYST1_PASSWORD } = env()
  await signIn(page, 'analyst1', ANALYST1_PASSWORD)

  await expect(page.getByText('£19,725,088')).toBeVisible()
  await expect(page.getByText('39,639')).toBeVisible()
  await expect(page.getByTestId('monthly-chart')).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'overview-analyst.png'), fullPage: true })

  const customerCall = page.waitForResponse((r) => r.url().includes('/customers/12347/summary'))
  await page.getByRole('link', { name: 'Customers' }).first().click()
  await page.getByLabel('Customer number').fill('12347')
  await page.getByRole('button', { name: 'Look up' }).click()
  const response = await customerCall
  expect(response.status()).toBe(403)
  expect(new URL(response.url()).port).toBe('8243') // the gateway, not the backend
  await expect(page.getByTestId('access-denied')).toContainText('Access denied by WSO2 API Manager (403)')
  await expect(page.getByTestId('access-denied')).toContainText('900910')
  await page.screenshot({ path: join(SHOTS, 'customers-analyst-403.png'), fullPage: true })

  await page.getByRole('link', { name: 'Access & Security' }).first().click()
  await expect(page.getByText('Analyst', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'access-analyst.png'), fullPage: true })
  await signOut(page)
})

test('manager sees the customer summary', async ({ page }) => {
  const { MANAGER1_PASSWORD } = env()
  await signIn(page, 'manager1', MANAGER1_PASSWORD)
  await page.getByRole('link', { name: 'Customers' }).first().click()
  await page.getByLabel('Customer number').fill('12347')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByTestId('customer-summary')).toContainText('£4,921.53')
  await expect(page.getByText('Based in Iceland')).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'customers-manager.png'), fullPage: true })

  await page.getByRole('link', { name: 'Products' }).first().click()
  await expect(page.getByRole('cell', { name: 'REGENCY CAKESTAND 3 TIER' })).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'products.png'), fullPage: true })
  await page.getByRole('link', { name: 'Countries' }).first().click()
  await expect(page.getByRole('cell', { name: 'United Kingdom' })).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'countries.png'), fullPage: true })
  await signOut(page)
})

test('a burst of refreshes gets a real 429 from the gateway', async ({ page }) => {
  const { ANALYST1_PASSWORD } = env()
  await signIn(page, 'analyst1', ANALYST1_PASSWORD)
  await expect(page.getByText('£19,725,088')).toBeVisible()

  let throttled = false
  page.on('response', (r) => {
    if (r.url().includes(':8243/') && r.status() === 429) throttled = true
  })
  // 30 requests per minute per user; each refresh makes two calls.
  for (let i = 0; i < 25 && !(await page.getByTestId('rate-limited').isVisible()); i++) {
    await page.getByRole('button', { name: 'Refresh' }).click()
    await page.waitForTimeout(250)
  }
  await expect(page.getByTestId('rate-limited')).toContainText('Too many requests, limited by WSO2')
  expect(throttled).toBe(true)
  await page.screenshot({ path: join(SHOTS, 'rate-limited.png'), fullPage: true })
})

test('mobile layout at 375px with dark theme', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const { MANAGER1_PASSWORD } = env()
  await signIn(page, 'manager1', MANAGER1_PASSWORD)
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.locator('#mobile-menu')).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'mobile-dark-menu.png'), fullPage: true })
  await page.getByRole('link', { name: 'Countries' }).click()
  await expect(page.getByRole('cell', { name: 'United Kingdom' })).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'mobile-dark-countries.png'), fullPage: true })
  // Theme is remembered across reloads.
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})
