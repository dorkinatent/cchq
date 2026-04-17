"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { messageQueue, type QueuedMessage } from "@/lib/message-queue";

export function useMessageQueue(sessionId: string) {
  const [messages, setMessages] = useState<QueuedMessage[]>([]);
  const processingRef = useRef(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Sync state from queue
  const sync = useCallback(() => {
    setMessages(messageQueue.getMessages(sessionId));
  }, [sessionId]);

  // Recover any "sending" messages on mount, then subscribe
  useEffect(() => {
    messageQueue.recover();
    sync();
    const unsub = messageQueue.subscribe(sync);
    return unsub;
  }, [sync]);

  // Process queued messages
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const queued = messageQueue
        .getMessages(sessionId)
        .filter((m) => m.status === "queued");

      for (const msg of queued) {
        // Respect retryAfter delay
        if (msg.retryAfter && Date.now() < msg.retryAfter) {
          const delay = msg.retryAfter - Date.now();
          if (!timersRef.current.has(msg.id)) {
            const timer = setTimeout(() => {
              timersRef.current.delete(msg.id);
              processQueue();
            }, delay);
            timersRef.current.set(msg.id, timer);
          }
          continue;
        }

        messageQueue.markSending(msg.id);

        try {
          const res = await fetch(`/api/sessions/${sessionId}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: msg.content,
              attachments: msg.attachments,
            }),
          });

          if (res.ok) {
            messageQueue.markSent(msg.id);
          } else {
            const retryAfterHeader = res.headers.get("Retry-After");
            let retryAfterTs: number | undefined;
            if (retryAfterHeader) {
              const seconds = parseInt(retryAfterHeader, 10);
              if (!isNaN(seconds)) {
                retryAfterTs = Date.now() + seconds * 1000;
              }
            }

            let errorMsg: string;
            try {
              const data = await res.json();
              errorMsg = data.error || `HTTP ${res.status}`;
            } catch {
              errorMsg = `HTTP ${res.status}`;
            }

            messageQueue.markFailed(msg.id, errorMsg, retryAfterTs);

            // Auto-retry with exponential backoff if under max attempts
            const updated = messageQueue
              .getMessages(sessionId)
              .find((m) => m.id === msg.id);
            if (updated && updated.attempts < updated.maxAttempts) {
              // Backoff: 1s, 3s, 9s
              const backoff = Math.pow(3, updated.attempts - 1) * 1000;
              const retryAt = retryAfterTs
                ? Math.max(retryAfterTs, Date.now() + backoff)
                : Date.now() + backoff;
              messageQueue.retry(msg.id);
              // Update retryAfter for the delay
              const allMsgs = messageQueue.getMessages(sessionId);
              const m = allMsgs.find((x) => x.id === msg.id);
              if (m) {
                // We set retryAfter via a small trick: mark queued but with a delay
                // The retryAfter field is checked in processQueue
                m.retryAfter = retryAt;
                // Write through directly
                const raw = localStorage.getItem("cchq-message-queue");
                const all: QueuedMessage[] = raw ? JSON.parse(raw) : [];
                const idx = all.findIndex((x) => x.id === msg.id);
                if (idx !== -1) {
                  all[idx].retryAfter = retryAt;
                  all[idx].status = "queued";
                  localStorage.setItem("cchq-message-queue", JSON.stringify(all));
                }
              }

              const delay = retryAt - Date.now();
              const timer = setTimeout(() => {
                timersRef.current.delete(msg.id);
                processQueue();
              }, delay);
              timersRef.current.set(msg.id, timer);
            }
          }
        } catch (err: unknown) {
          const errorMsg =
            err instanceof Error ? err.message : "Network error";
          messageQueue.markFailed(msg.id, errorMsg);

          const updated = messageQueue
            .getMessages(sessionId)
            .find((m) => m.id === msg.id);
          if (updated && updated.attempts < updated.maxAttempts) {
            const backoff = Math.pow(3, updated.attempts - 1) * 1000;
            messageQueue.retry(msg.id);
            const retryAt = Date.now() + backoff;
            const raw = localStorage.getItem("cchq-message-queue");
            const all: QueuedMessage[] = raw ? JSON.parse(raw) : [];
            const idx = all.findIndex((x) => x.id === msg.id);
            if (idx !== -1) {
              all[idx].retryAfter = retryAt;
              all[idx].status = "queued";
              localStorage.setItem("cchq-message-queue", JSON.stringify(all));
            }

            const timer = setTimeout(() => {
              timersRef.current.delete(msg.id);
              processQueue();
            }, backoff);
            timersRef.current.set(msg.id, timer);
          }
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [sessionId]);

  // Process whenever messages change
  useEffect(() => {
    processQueue();
  }, [messages, processQueue]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  const enqueue = useCallback(
    (content: string, attachments?: { path: string; name: string }[]) => {
      messageQueue.enqueue(sessionId, content, attachments);
    },
    [sessionId]
  );

  const retry = useCallback((id: string) => {
    messageQueue.retry(id);
  }, []);

  const remove = useCallback((id: string) => {
    messageQueue.remove(id);
  }, []);

  return { messages, enqueue, retry, remove };
}
