import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/hooks/use-session-messages";
import { ToolUseBlock } from "./tool-use-block";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const timestamp = message.created_at || (message as any).createdAt;
  const timeDisplay = timestamp ? new Date(timestamp).toLocaleTimeString() : "";

  const hasContent = !!message.content?.trim();

  return (
    <div className="mb-5">
      <div className="text-[11px] text-[var(--text-muted)] mb-1">
        {isUser ? "You" : "Claude"} &middot; {timeDisplay}
      </div>
      {hasContent && (
        <div
          className={`rounded-lg px-4 py-3 text-sm leading-relaxed max-w-[80%] ${
            isUser
              ? "bg-[var(--user-msg-bg)] text-[var(--user-msg-text)]"
              : "bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)]"
          }`}
        >
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
          <div className="mt-1.5 max-w-[80%]">
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
