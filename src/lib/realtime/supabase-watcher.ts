// src/lib/realtime/supabase-watcher.ts
import "server-only";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sessionListBus } from "./session-list-bus";
import { sessionEventBus } from "@/lib/sessions/stream-events";

let started = false;

/**
 * Opens a single server-side Supabase realtime subscription for the sessions
 * and messages tables and relays changes to the in-process buses. Idempotent:
 * safe to call multiple times.
 */
export function ensureSupabaseWatcher(): void {
  if (started) return;
  started = true;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    console.warn("[watcher] Supabase env vars not set; realtime session-list updates disabled. Refresh to see new sessions/messages.");
    return;
  }

  const supabase = getSupabaseServer();

  supabase
    .channel("watcher-sessions")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sessions" },
      (payload) => {
        const row: any = payload.new ?? payload.old ?? {};
        const sessionId = row.id;
        if (!sessionId) return;
        const timestamp = Date.now();
        if (payload.eventType === "INSERT") {
          sessionListBus.emit({ type: "session_created", sessionId, timestamp });
        } else if (payload.eventType === "DELETE") {
          sessionListBus.emit({ type: "session_deleted", sessionId, timestamp });
        } else {
          sessionListBus.emit({ type: "session_updated", sessionId, timestamp });
        }
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("[watcher] sessions channel", status);
      }
    });

  supabase
    .channel("watcher-messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const row: any = payload.new ?? {};
        const { id: messageId, session_id: sessionId, role } = row;
        if (!messageId || !sessionId || !role) return;
        const timestamp = Date.now();
        sessionListBus.emit({ type: "message_added", sessionId, messageId, timestamp });
        sessionEventBus.emit(sessionId, {
          type: "message_added",
          messageId,
          role,
          timestamp,
        });
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("[watcher] messages channel", status);
      }
    });
}
