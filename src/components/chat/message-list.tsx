"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/hooks/use-session-messages";
import { MessageBubble } from "./message-bubble";

export function MessageList({
  messages,
  thinking,
}: {
  messages: Message[];
  thinking?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thinking]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      {messages
        .filter((m) => m.role !== "system")
        .map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      {thinking && (
        <div className="mb-5">
          <div className="text-[11px] text-[var(--text-muted)] mb-1">Claude</div>
          <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-secondary)] max-w-[80%] flex items-center gap-2">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            <span>Thinking...</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
