import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Short commit SHA identifies this build. Deliberately not a timestamp: a
// backend-only deploy that rebuilds the frontend from an unchanged commit
// must produce the SAME id, or every deploy would falsely tell open tabs
// a new frontend shipped even when nothing about the frontend changed.
function getBuildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// Writes dist/version.json after the build so a running tab can poll it to
// learn the server's current build id. This must be a plain static file,
// never embedded in the hashed JS bundle -- the whole point is for an old,
// already-loaded tab (running old JS) to detect a NEW id without reloading.
function writeVersionFile(buildId: string): Plugin {
  return {
    name: 'write-version-file',
    closeBundle() {
      writeFileSync(resolve(__dirname, 'dist/version.json'), JSON.stringify({ buildId }))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const buildId = getBuildId()

  // Parse allowed hosts from environment variable
  // Format: comma-separated list, e.g., "ect.example.com,localhost"
  // Default: localhost only (secure by default)
  const allowedHosts = env.VITE_ALLOWED_HOSTS 
    ? env.VITE_ALLOWED_HOSTS.split(',').map(h => h.trim())
    : ['localhost', '127.0.0.1']
  
  // Backend port - can be configured via VITE_BACKEND_PORT or defaults to 8000
  const backendPort = env.VITE_BACKEND_PORT || '8000'
  
  return {
    plugins: [react(), writeVersionFile(buildId)],
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    build: {
      // Production is a 1.8 GB VPS with no swap, and gzip-sizing a ~3 MB bundle
      // is the peak-memory moment of the whole build. It is pure console
      // reporting -- nothing consumes the number -- but being killed there is
      // NOT harmless: the writeVersionFile plugin's closeBundle hook runs after
      // it, so a kill at that point leaves dist/ complete except for
      // version.json, and every open tab silently loses update detection while
      // the site itself looks perfectly healthy. That happened on 2026-09-03,
      // even with NODE_OPTIONS=--max-old-space-size=1024. Keep the heap cap and
      // the post-build checks anyway; this just removes the biggest spike.
      reportCompressedSize: false,
    },
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
