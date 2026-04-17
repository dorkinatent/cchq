"use client";

import { useState } from "react";
import type { Message } from "@/hooks/use-session-messages";
import { MessageBubble } from "./message-bubble";

type ToolSummary = { name: string; count: number };

export function CollapsedToolGroup({
  tools,
  messages,
}: {
  tools: ToolSummary[];
  messages: Message[];
}) {
  const [expanded, setExpanded] = useState(false);

  const totalCount = tools.reduce((sum, t) => sum + t.count, 0);
  const summaryParts = tools.map(
    (t) => `${t.name} ${t.count}`
  );

  return (
    <div className="mb-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors py-1.5 px-3 rounded-md bg-[var(--surface-raised)] border border-[var(--border)] w-fit"
      >
        <span
          className="inline-block transition-transform duration-150"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9654;
        </span>
        <span>
          {totalCount} tool call{totalCount !== 1 ? "s" : ""} &mdash;{" "}
          {summaryParts.join(", ")}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 ml-3 pl-3 py-2 bg-[color-mix(in_oklch,var(--surface-raised)_40%,transparent)] rounded-md">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}
