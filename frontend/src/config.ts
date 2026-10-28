/** Runtime configuration, written to frontend/.env.local by wso2/scripts/setup_all.py. */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Run "python wso2\\scripts\\setup_all.py" to generate frontend/.env.local.`)
  }
  return value.replace(/\/$/, '')
}

export const config = {
  /** Public OAuth2 client ID of the "Dashboard" application (PKCE, no secret). */
  clientId: required('VITE_WSO2_CLIENT_ID', import.meta.env.VITE_WSO2_CLIENT_ID),
  /** WSO2 API Manager (key manager) base URL, used for the login and logout pages. */
  wso2Url: required('VITE_WSO2_URL', import.meta.env.VITE_WSO2_URL),
  /** The DataGuard API on the WSO2 gateway. All data calls go here, never to the backend. */
  apiUrl: required('VITE_GATEWAY_API_URL', import.meta.env.VITE_GATEWAY_API_URL),
  /** Token endpoint, proxied same-origin by Vite (see vite.config.ts). */
  tokenUrl: '/oauth2/token',
  /** Ask for everything; WSO2 only grants the scopes the user's role allows. */
  scopes: 'openid sales:read customer:read',
}

export const redirectUri = () => `${window.location.origin}/callback`
