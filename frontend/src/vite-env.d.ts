/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected by vite.config.ts's `define` from the git commit short SHA at
// build time. See useBuildVersion.ts.
declare const __BUILD_ID__: string
