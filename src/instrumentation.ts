// src/instrumentation.ts
// Next.js calls register() once per server process at startup.
// Ref: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSupabaseWatcher } = await import("@/lib/realtime/supabase-watcher");
  ensureSupabaseWatcher();
}
