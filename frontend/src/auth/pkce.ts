/** PKCE helpers (RFC 7636), using the browser's built-in Web Crypto. */

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A secure random string that is safe in URLs (32 bytes -> 43 characters). */
export function randomString(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

/** The S256 code challenge: base64url(SHA-256(verifier)). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}
