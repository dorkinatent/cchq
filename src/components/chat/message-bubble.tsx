"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/hooks/use-session-messages";
import { ToolUseBlock } from "./tool-use-block";
import { CommandCard } from "./command-card";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers / insecure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity absolute top-2 right-2 p-1.5 rounded bg-[var(--surface)]/80 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2.5 7.5 5.5 10.5 11.5 4.5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
          <path d="M9.5 4.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v5A1.5 1.5 0 0 0 3 9.5h1.5" />
        </svg>
      )}
    </button>
  );
}

export function MessageBubble({
  message,
  sessionId,
  onSessionUpdate,
}: {
  message: Message;
  sessionId?: string;
  onSessionUpdate?: () => void;
}) {
  const isUser = message.role === "user";
  const timestamp = message.created_at || (message as any).createdAt;
  const timeDisplay = timestamp ? new Date(timestamp).toLocaleTimeString() : "";

  const hasContent = !!message.content?.trim();

  // Render command result cards for system messages
  if (message.commandResult && message.role === "system") {
    return (
      <div className="mb-5">
        <CommandCard
          result={message.commandResult}
          sessionId={sessionId || message.session_id}
          onSessionUpdate={onSessionUpdate}
        />
      </div>
    );
  }

  return (
    <div className="mb-5">
      <div className="text-[11px] text-[var(--text-muted)] mb-1">
        {isUser ? "You" : "Claude"} &middot; {timeDisplay}
      </div>
      {hasContent && (
        <div
          className={`group relative rounded-lg px-4 py-3 text-sm leading-relaxed max-w-[min(96%,720px)] ${
            isUser
              ? "bg-[var(--user-msg-bg)] text-[var(--user-msg-text)]"
              : "bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)]"
          }`}
        >
          <CopyButton text={message.content || ""} />
          {isUser ? (
            <div>
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.tool_use && Array.isArray(message.tool_use) && message.tool_use.length > 0 && message.tool_use[0]?.name && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {message.tool_use.map((att: any, i: number) => (
                    <div key={i} className="text-[11px] text-[var(--accent)] bg-[var(--user-msg-bg)] px-2 py-1 rounded">
                      {att.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--accent)] prose-strong:text-[var(--text-primary)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
      {!isUser && (
        (message.tool_use && Array.isArray(message.tool_use) && message.tool_use.length > 0) || message.thinking ? (
          <ToolUseBlock
            tools={(message.tool_use && Array.isArray(message.tool_use)) ? message.tool_use : []}
            thinking={message.thinking}
          />
        ) : hasContent ? (
          <div className="mt-1.5 max-w-[min(96%,720px)]">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-[var(--text-muted)] text-xs">·</span>
                <span className="text-xs text-[var(--text-muted)]">No tool calls · text-only response</span>
              </div>
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
