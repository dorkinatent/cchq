"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Message } from "@/hooks/use-session-messages";

export type { Message };

export function useMessagePagination(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const messagesRef = useRef<Message[]>([]);

  // Initial load
  useEffect(() => {
    let cancelled = false;

    async function fetchInitial() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/messages?limit=50`
        );
        const data = await res.json();
        if (!cancelled) {
          messagesRef.current = data.messages;
          setMessages(data.messages);
          setHasMore(data.hasMore);
        }
      } catch {
        // ignore
      }
      if (!cancelled) setLoading(false);
    }

    fetchInitial();

    async function handleMessageAdded() {
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/messages?limit=50`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          messages: Message[];
          hasMore: boolean;
        };
        if (cancelled) return;
        const existing = new Set(messagesRef.current.map((m) => m.id));
        const added = body.messages.filter((m) => !existing.has(m.id));
        if (added.length === 0) return;
        // body.messages is ascending; append only those we don't already have.
        messagesRef.current = [...messagesRef.current, ...added];
        setMessages([...messagesRef.current]);
      } catch {
        // ignore
      }
    }

    // Realtime subscription via server-sent events on the session stream.
    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt?.type === "message_added") {
          void handleMessageAdded();
        }
      } catch {
        // ignore malformed payloads
      }
    };
    es.onerror = () => {
      // browser auto-reconnects; nothing to do
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [sessionId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messagesRef.current.length === 0) return;

    const oldest = messagesRef.current[0];
    // Drizzle returns camelCase `createdAt`; Supabase Realtime returns snake_case `created_at`.
    const oldestTimestamp =
      oldest.created_at || (oldest as unknown as { createdAt?: string }).createdAt;
    if (!oldestTimestamp) return;

    setLoadingMore(true);

    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/messages?before=${encodeURIComponent(oldestTimestamp)}&limit=50`
      );
      if (!res.ok) {
        setLoadingMore(false);
        return;
      }
      const data = await res.json();
      const olderMessages: Message[] = data.messages;
      messagesRef.current = [...olderMessages, ...messagesRef.current];
      setMessages([...messagesRef.current]);
      setHasMore(data.hasMore);
    } catch {
      // ignore
    }
    setLoadingMore(false);
  }, [sessionId, loadingMore, hasMore]);

  return { messages, loading, loadingMore, hasMore, loadMore };
}
