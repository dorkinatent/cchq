import { sessionEventBus, type StreamEvent } from "@/lib/sessions/stream-events";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Initial ping
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`));

      unsubscribe = sessionEventBus.subscribe(id, (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.type === "result" || event.type === "error") {
            setTimeout(() => {
              try { controller.close(); } catch {}
            }, 100);
          }
        } catch {
          // Stream closed
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`));
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
