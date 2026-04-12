"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
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

    // Realtime subscription for new messages
    // Unique channel name per effect run to avoid StrictMode double-mount issues.
    const channelName = `paginated-messages-${sessionId}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (messagesRef.current.some((m) => m.id === newMsg.id)) return;
          messagesRef.current = [...messagesRef.current, newMsg];
          setMessages([...messagesRef.current]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
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
