import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      /**
       * Dev proxy: forward /api/v1/* to the FastAPI backend at :8000.
       *
       * Why this matters for cookie auth:
       *   Without a proxy, the frontend (localhost:5173) and backend
       *   (localhost:8000) are different origins.  httpOnly cookies set by
       *   :8000 would be cross-origin and require SameSite=None + Secure,
       *   which doesn't work over plain HTTP in dev.
       *
       *   With this proxy, the browser sees EVERYTHING on localhost:5173, so
       *   cookies from /api/v1/auth/login are same-site and work with
       *   SameSite=Lax (the default).
       *
       * In production, serve the SPA from the same origin as the API
       * (e.g. via nginx) — no proxy needed.
       */
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        // Forward Set-Cookie headers unchanged so the browser stores them
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Rewrite cookie domain/path if needed
            const setCookie = proxyRes.headers['set-cookie']
            if (setCookie) {
              proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
                cookie
                  .replace(/; Domain=[^;]+/i, '')   // strip backend domain
                  .replace(/; Secure/i, ''),          // strip Secure for HTTP dev
              )
            }
          })
        },
      },
    },
  },
})
