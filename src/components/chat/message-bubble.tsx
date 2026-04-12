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
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
      {message.tool_use && Array.isArray(message.tool_use) && (
        <ToolUseBlock tools={message.tool_use} />
      )}
    </div>
  );
}
