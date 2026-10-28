/** App settings. wso2/scripts/setup_all.py writes them to frontend/.env.local. */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Run "python wso2\\scripts\\setup_all.py" to generate frontend/.env.local.`)
  }
  return value.replace(/\/$/, '')
}

export const config = {
  /** Client ID of the "Dashboard" application. It's public (PKCE, no secret). */
  clientId: required('VITE_WSO2_CLIENT_ID', import.meta.env.VITE_WSO2_CLIENT_ID),
  /** WSO2 API Manager address, used for the login and logout pages. */
  wso2Url: required('VITE_WSO2_URL', import.meta.env.VITE_WSO2_URL),
  /** The DataGuard API on the WSO2 gateway. All data calls go here, never straight to the backend. */
  apiUrl: required('VITE_GATEWAY_API_URL', import.meta.env.VITE_GATEWAY_API_URL),
  /** Token endpoint. Vite passes it through to WSO2 (see vite.config.ts). */
  tokenUrl: '/oauth2/token',
  /** Ask for every scope. WSO2 only gives the ones the user's role allows. */
  scopes: 'openid sales:read customer:read',
}

export const redirectUri = () => `${window.location.origin}/callback`
