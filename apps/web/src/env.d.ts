// Build-time settings read through import.meta.env; Vite inlines any variable
// prefixed VITE_ from the environment or a .env file.
interface ImportMetaEnv {
  /** Site id the root path redirects to; unset means the root shows a notice. */
  readonly VITE_DEFAULT_SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
