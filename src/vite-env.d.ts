/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "api" to use the backend; anything else uses generated sample data. */
  readonly VITE_DATA_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
