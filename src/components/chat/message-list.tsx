"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/hooks/use-session-messages";
import { MessageBubble } from "./message-bubble";

export function MessageList({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      {messages
        .filter((m) => m.role !== "system")
        .map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      <div ref={bottomRef} />
    </div>
  );
}
