import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  // Parse allowed hosts from environment variable
  // Format: comma-separated list, e.g., "ect.example.com,localhost"
  // Default: localhost only (secure by default)
  const allowedHosts = env.VITE_ALLOWED_HOSTS 
    ? env.VITE_ALLOWED_HOSTS.split(',').map(h => h.trim())
    : ['localhost', '127.0.0.1']
  
  return {
    plugins: [react()],
    server: {
      port: 3000,
      // Restrict hosts to configured list for security
      // Set VITE_ALLOWED_HOSTS in frontend/.env for custom domains
      allowedHosts,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:8000',
          ws: true,
        }
      }
    }
  }
})
