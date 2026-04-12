"use client";

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import type { Message } from "@/hooks/use-session-messages";
import type { StreamState } from "@/hooks/use-session-stream";
import { MessageBubble } from "./message-bubble";
import { StreamingIndicator } from "./streaming-indicator";
import { CollapsedToolGroup } from "./collapsed-tool-group";

export type MessageListHandle = {
  scrollToMessage: (messageId: string) => void;
};

type ToolSummary = { name: string; count: number };

type MessageGroup =
  | { type: "message"; message: Message }
  | { type: "tool-group"; messages: Message[]; tools: ToolSummary[] };

function isToolHeavyMessage(message: Message): boolean {
  if (message.role !== "assistant") return false;
  const hasTools =
    message.tool_use && Array.isArray(message.tool_use) && message.tool_use.length > 0;
  if (!hasTools) return false;
  // Consider tool-heavy if content is very short or empty
  const textContent = (message.content || "").trim();
  return textContent.length < 40;
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentToolRun: Message[] = [];

  function flushToolRun() {
    if (currentToolRun.length >= 3) {
      const toolCounts: Record<string, number> = {};
      for (const msg of currentToolRun) {
        if (msg.tool_use && Array.isArray(msg.tool_use)) {
          for (const tool of msg.tool_use) {
            const name = tool.name || "Unknown";
            toolCounts[name] = (toolCounts[name] || 0) + 1;
          }
        }
      }
      const tools: ToolSummary[] = Object.entries(toolCounts).map(
        ([name, count]) => ({ name, count })
      );
      groups.push({ type: "tool-group", messages: currentToolRun, tools });
    } else {
      for (const msg of currentToolRun) {
        groups.push({ type: "message", message: msg });
      }
    }
    currentToolRun = [];
  }

  for (const msg of messages) {
    if (msg.role === "system") continue;
    if (isToolHeavyMessage(msg)) {
      currentToolRun.push(msg);
    } else {
      flushToolRun();
      groups.push({ type: "message", message: msg });
    }
  }
  flushToolRun();

  return groups;
}

export const MessageList = forwardRef<
  MessageListHandle,
  {
    messages: Message[];
    streamState?: StreamState;
    hasMore?: boolean;
    loadingMore?: boolean;
    onLoadMore?: () => void;
  }
>(function MessageList({ messages, streamState, hasMore, loadingMore, onLoadMore }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isLoadingMoreRef = useRef(false);

  // Expose scrollToMessage
  useImperativeHandle(ref, () => ({
    scrollToMessage(messageId: string) {
      const el = containerRef.current?.querySelector(
        `[data-message-id="${messageId}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Briefly highlight
        el.classList.add("bg-[var(--accent)]/10");
        setTimeout(() => el.classList.remove("bg-[var(--accent)]/10"), 2000);
      }
    },
  }));

  // Auto-scroll to bottom on new messages (only if already near bottom)
  useEffect(() => {
    if (isLoadingMoreRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, streamState?.phase, streamState?.streamingText]);

  // Scroll anchoring: restore scroll position after prepending older messages
  useEffect(() => {
    if (isLoadingMoreRef.current && containerRef.current) {
      const newScrollHeight = containerRef.current.scrollHeight;
      const addedHeight = newScrollHeight - prevScrollHeightRef.current;
      containerRef.current.scrollTop += addedHeight;
      isLoadingMoreRef.current = false;
    }
  }, [messages]);

  // Infinite scroll: detect scroll to top
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !hasMore || loadingMore) return;
    if (container.scrollTop < 100 && onLoadMore) {
      prevScrollHeightRef.current = container.scrollHeight;
      isLoadingMoreRef.current = true;
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  const groups = groupMessages(messages);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-5"
    >
      {loadingMore && (
        <div className="text-center text-xs text-[var(--text-muted)] py-2 mb-3">
          Loading older messages...
        </div>
      )}
      {hasMore && !loadingMore && (
        <div className="text-center text-xs text-[var(--text-muted)] py-2 mb-3">
          Scroll up for older messages
        </div>
      )}
      {groups.map((group, i) => {
        if (group.type === "tool-group") {
          return (
            <div key={`tool-group-${i}`}>
              {group.messages.map((m) => (
                <div key={m.id} data-message-id={m.id} className="hidden" />
              ))}
              <CollapsedToolGroup tools={group.tools} messages={group.messages} />
            </div>
          );
        }
        return (
          <div key={group.message.id} data-message-id={group.message.id}>
            <MessageBubble message={group.message} />
          </div>
        );
      })}
      {streamState && streamState.phase !== "idle" && (
        <StreamingIndicator state={streamState} />
      )}
      <div ref={bottomRef} />
    </div>
  );
});
