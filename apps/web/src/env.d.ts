// Build-time settings read through import.meta.env; Vite inlines any variable
// prefixed VITE_ from the environment or a .env file.
interface ImportMetaEnv {
  /** "true" lets a production build replay traces and take a fixed position. */
  readonly VITE_ENABLE_REPLAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
