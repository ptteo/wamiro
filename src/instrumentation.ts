/**
 * Next.js server boot hook. GlitchTip capture is lazy (GLITCHTIP_DSN);
 * nothing to initialize when the DSN is unset.
 */
export async function register() {
  /* captureException in src/lib/glitchtip.ts is the ingest path */
}
