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
  
  // Backend port - can be configured via VITE_BACKEND_PORT or defaults to 8000
  const backendPort = env.VITE_BACKEND_PORT || '8000'
  
  return {
    plugins: [react()],
    server: {
      port: 3000,
      // Restrict hosts to configured list for security
      // Set VITE_ALLOWED_HOSTS in frontend/.env for custom domains
      allowedHosts,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `ws://localhost:${backendPort}`,
          ws: true,
        }
      }
    },
    // `vite preview` serves the built dist/ (fast, production-like) while still
    // proxying /api and /ws to the backend exactly like the dev server. Used on
    // beta when serving a production build instead of the HMR dev server so
    // headless tooling loads the app in ~1-2s instead of a slow dev cold-start.
    preview: {
      port: 3000,
      allowedHosts,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `ws://localhost:${backendPort}`,
          ws: true,
        }
      }
    }
  }
})
