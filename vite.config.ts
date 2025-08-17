import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'settings-file-api',
      configureServer(server) {
        const settingsPath = path.resolve(process.cwd(), 'ai-provider-settings.json')

        server.middlewares.use('/api/settings', (req, res) => {
          if (req.method === 'GET') {
            fs.promises
              .readFile(settingsPath, 'utf-8')
              .then((data) => {
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(data)
              })
              .catch(() => {
                // File not found -> return 204 No Content
                res.statusCode = 204
                res.end()
              })
            return
          }

          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', async () => {
              try {
                const data = JSON.parse(body || '{}')
                await fs.promises.writeFile(settingsPath, JSON.stringify(data, null, 2), 'utf-8')
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: true }))
              } catch (err: any) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: false, error: err?.message || 'Invalid JSON' }))
              }
            })
            return
          }

          res.statusCode = 405
          res.end('Method Not Allowed')
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/mcp': {
        target: 'http://192.168.31.20:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})