/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser exchanges its PKCE authorization code at WSO2's token endpoint.
// API Manager 4.6.0 sends no CORS headers on /oauth2/token by default, so the
// dev/preview server forwards just that one path same-origin instead of
// changing the server's deployment.toml (see docs/decisions.md).
// secure: false accepts API Manager's self-signed certificate - LOCAL ONLY.
const tokenProxy = {
  '/oauth2/token': { target: 'https://localhost:9443', changeOrigin: true, secure: false },
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: tokenProxy },
  preview: { port: 5173, strictPort: true, proxy: tokenProxy },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: {
      VITE_WSO2_CLIENT_ID: 'test-client-id',
      VITE_WSO2_URL: 'https://wso2.test:9443',
      VITE_GATEWAY_API_URL: 'https://gateway.test:8243/dataguard/1.0.0',
    },
  },
})
