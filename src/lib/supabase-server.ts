// src/lib/supabase-server.ts
// Server-only Supabase client. Do NOT import from client components.
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars not set (NEXT_PUBLIC_SUPABASE_URL + anon or service key)"
    );
  }
  if (!serviceKey) {
    // Service role bypasses Row Level Security; anon respects it. Downstream
    // server code that assumes elevated privileges (e.g. the realtime watcher
    // subscribing to all tables) may silently misbehave on the anon key.
    console.warn(
      "[supabase-server] SUPABASE_SERVICE_ROLE_KEY not set; using anon key. " +
      "RLS will be enforced, which may limit watcher/admin functionality."
    );
  }
  _client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: { persistSession: false },
  });
  return _client;
}
