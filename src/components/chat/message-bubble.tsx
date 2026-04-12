import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/hooks/use-session-messages";
import { ToolUseBlock } from "./tool-use-block";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const timeAgo = new Date(message.created_at).toLocaleTimeString();

  return (
    <div className="mb-5">
      <div className="text-[11px] text-neutral-600 mb-1">
        {isUser ? "You" : "Claude"} &middot; {timeAgo}
      </div>
      <div
        className={`rounded-lg px-4 py-3 text-sm leading-relaxed max-w-[80%] ${
          isUser
            ? "bg-blue-950/30 text-blue-100"
            : "bg-neutral-900 border border-neutral-800 text-neutral-300"
        }`}
      >
        {isUser ? (
          <div>
            <div className="whitespace-pre-wrap">{message.content}</div>
            {message.tool_use && Array.isArray(message.tool_use) && message.tool_use.length > 0 && message.tool_use[0]?.name && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {message.tool_use.map((att: any, i: number) => (
                  <div key={i} className="text-[11px] text-blue-300 bg-blue-950/30 px-2 py-1 rounded">
                    {att.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:bg-neutral-950 prose-pre:border prose-pre:border-neutral-800 prose-code:text-blue-300 prose-code:before:content-none prose-code:after:content-none prose-a:text-blue-400 prose-strong:text-neutral-200">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {message.tool_use && Array.isArray(message.tool_use) && (
        <ToolUseBlock tools={message.tool_use} />
      )}
    </div>
  );
}
