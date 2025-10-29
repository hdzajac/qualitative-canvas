/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // ...existing code...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
