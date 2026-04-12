"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/hooks/use-session-messages";
import type { StreamState } from "@/hooks/use-session-stream";
import { MessageBubble } from "./message-bubble";
import { StreamingIndicator } from "./streaming-indicator";

export function MessageList({
  messages,
  streamState,
}: {
  messages: Message[];
  streamState?: StreamState;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamState?.phase, streamState?.streamingText]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      {messages
        .filter((m) => m.role !== "system")
        .map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      {streamState && streamState.phase !== "idle" && (
        <StreamingIndicator state={streamState} />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
