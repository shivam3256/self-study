import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const adminPrefix = env.VITE_ADMIN_PATH_PREFIX || '/ops-k7x2q9m4'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        [`${adminPrefix}/api`]: {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        }
      }
    }
  }
})
