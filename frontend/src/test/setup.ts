import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom doesn't do layout, so every element is 0x0. Recharts sizes its charts
// with ResizeObserver, so this fake one just reports a desktop-sized box.
class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    const entry = { target, contentRect: { width: 800, height: 300, top: 0, left: 0, bottom: 300, right: 800, x: 0, y: 0 } }
    this.callback([entry as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  sessionStorage.clear()
})
