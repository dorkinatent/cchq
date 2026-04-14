"use client";

import { useEffect, useRef, useState } from "react";
import type { CommandResult } from "@/types/command-result";

export type Message = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_use: unknown;
  thinking: string | null;
  created_at: string;
  commandResult?: CommandResult;
};

export function useSessionMessages(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        // Default limit=50 returns the most recent page. That matches the previous
        // behavior well enough for initial render; pagination for older messages
        // is handled separately by use-message-pagination.ts.
        const res = await fetch(`/api/sessions/${sessionId}/messages`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { messages: Message[]; hasMore: boolean };
        if (cancelled) return;
        messagesRef.current = body.messages;
        setMessages(body.messages);
        setLoading(false);
      } catch (err) {
        console.error("[useSessionMessages] fetch failed", err);
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt?.type === "message_added") {
          // Simplest correct approach: refetch the latest page.
          // List is small; network cost is tiny.
          loadAll();
        }
      } catch {
        // Ignore malformed events.
      }
    };
    es.onerror = () => {
      // Browser auto-reconnects; no-op.
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [sessionId]);

  return { messages, loading };
}
