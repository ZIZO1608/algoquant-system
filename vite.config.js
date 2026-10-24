import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The UI talks to the API through this proxy, so a phone on the same Wi-Fi that opens
// http://<laptop-ip>:5173 reaches the API (and the realtime socket) without any CORS setup.
// 127.0.0.1 rather than localhost: it avoids an IPv6/IPv4 resolution mismatch on Windows.
const API_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001'

/**
 * A proxy error (API restarting, socket dropped) must never take down the dev server.
 * Without this, an unhandled 'error' event from the ws proxy exits the Vite process.
 */
function tolerateProxyErrors(proxy) {
  proxy.on('error', (err, _req, resOrSocket) => {
    const reason = err && err.code ? err.code : 'proxy error'
    if (resOrSocket && typeof resOrSocket.writeHead === 'function') {
      if (!resOrSocket.headersSent) {
        resOrSocket.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      }
      resOrSocket.end(JSON.stringify({ error: { code: 'API_UNREACHABLE', message: reason } }))
      return
    }
    // WebSocket upgrade: the third argument is a raw socket
    if (resOrSocket && typeof resOrSocket.destroy === 'function') resOrSocket.destroy()
  })
}

const proxy = {
  '/api': {
    target: API_TARGET,
    changeOrigin: true,
    configure: tolerateProxyErrors,
  },
  '/socket.io': {
    target: API_TARGET,
    ws: true,
    changeOrigin: true,
    configure: tolerateProxyErrors,
  },
}

const host = process.env.VITE_HOST === '1' ? '0.0.0.0' : undefined

// Local runtime data and build artefacts: watching these adds nothing, and a file that is
// briefly locked while being written makes the watcher throw and take the dev server down.
const ignored = ['**/.local/**', '**/dist/**', '**/*.exe', '**/*.ico', '**/.git/**']

export default defineConfig({
  plugins: [react()],
  server: { host, proxy, watch: { ignored } },
  preview: { host, proxy },
})
