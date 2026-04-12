"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

export type Message = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_use: any;
  thinking: string | null;
  created_at: string;
};

export function useSessionMessages(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    async function fetchMessages() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (data) {
        messagesRef.current = data;
        setMessages(data);
      }
      setLoading(false);
    }

    fetchMessages();

    const channel = supabase
      .channel(`messages-${sessionId}`)
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
          // Deduplicate — skip if we already have this message
          if (messagesRef.current.some((m) => m.id === newMsg.id)) return;
          messagesRef.current = [...messagesRef.current, newMsg];
          setMessages([...messagesRef.current]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { messages, loading };
}
