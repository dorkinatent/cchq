import { sessionListBus, type SessionListEvent } from "@/lib/realtime/session-list-bus";
import { ensureSupabaseWatcher } from "@/lib/realtime/supabase-watcher";

export const dynamic = "force-dynamic";

export async function GET() {
  // Belt-and-suspenders: instrumentation.ts should have already started the watcher.
  ensureSupabaseWatcher();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`
        )
      );

      unsubscribe = sessionListBus.subscribe((event: SessionListEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream closed
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`
            )
          );
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
