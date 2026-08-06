interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly VITE_NAVIDROME_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}