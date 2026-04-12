"use client";

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import type { Message } from "@/hooks/use-session-messages";
import type { StreamState } from "@/hooks/use-session-stream";
import { MessageBubble } from "./message-bubble";
import { StreamingIndicator } from "./streaming-indicator";

export type MessageListHandle = {
  scrollToMessage: (messageId: string) => void;
};

/**
 * Group consecutive assistant messages into a single "turn" so we render
 * one bubble + one activity caret per Claude response, instead of separate
 * bubbles for each tool call.
 */
function groupIntoTurns(messages: Message[]): Message[] {
  const result: Message[] = [];
  const filtered = messages.filter((m) => m.role !== "system");

  let i = 0;
  while (i < filtered.length) {
    const msg = filtered[i];
    if (msg.role !== "assistant") {
      result.push(msg);
      i++;
      continue;
    }

    // Collect all consecutive assistant messages into one turn
    const turn: Message[] = [msg];
    let j = i + 1;
    while (j < filtered.length && filtered[j].role === "assistant") {
      turn.push(filtered[j]);
      j++;
    }

    if (turn.length === 1) {
      result.push(msg);
    } else {
      // Merge into a single synthetic message
      const combinedContent = turn
        .map((m) => (m.content || "").trim())
        .filter(Boolean)
        .join("\n\n");

      const combinedTools: unknown[] = [];
      for (const m of turn) {
        if (m.tool_use && Array.isArray(m.tool_use)) {
          combinedTools.push(...m.tool_use);
        }
      }

      const combinedThinking = turn
        .map((m) => (m.thinking || "").trim())
        .filter(Boolean)
        .join("\n\n");

      result.push({
        id: turn[0].id, // keep first message's id for scroll-to
        session_id: turn[0].session_id,
        role: "assistant",
        content: combinedContent,
        tool_use: combinedTools.length > 0 ? combinedTools : null,
        thinking: combinedThinking || null,
        created_at: turn[0].created_at,
      });
    }

    i = j;
  }

  return result;
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
  const hasDoneInitialScrollRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);

  // Expose scrollToMessage
  useImperativeHandle(ref, () => ({
    scrollToMessage(messageId: string) {
      const el = containerRef.current?.querySelector(
        `[data-message-id="${messageId}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("bg-[var(--accent)]/10");
        setTimeout(() => el.classList.remove("bg-[var(--accent)]/10"), 2000);
      }
    },
  }));

  // Scroll behavior:
  //  - Initial load: jump straight to bottom.
  //  - User just sent a message: force-scroll to bottom (even if they had
  //    scrolled up to read history — submitting always pulls you down).
  //  - Assistant is streaming / any other update: only auto-follow if the
  //    user is already near the bottom, so we don't yank them while reading.
  useEffect(() => {
    if (isLoadingMoreRef.current) return;
    const container = containerRef.current;
    if (!container || messages.length === 0) return;

    if (!hasDoneInitialScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      hasDoneInitialScrollRef.current = true;
      lastMessageIdRef.current = messages[messages.length - 1].id;
      return;
    }

    const lastMsg = messages[messages.length - 1];
    const isNewMessage = lastMsg.id !== lastMessageIdRef.current;
    const isNewUserMessage = isNewMessage && lastMsg.role === "user";
    lastMessageIdRef.current = lastMsg.id;

    if (isNewUserMessage) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamState?.phase, streamState?.streamingText]);

  // Scroll anchoring: restore scroll position after prepending older messages
  useEffect(() => {
    if (isLoadingMoreRef.current && containerRef.current) {
      const newScrollHeight = containerRef.current.scrollHeight;
      const addedHeight = newScrollHeight - prevScrollHeightRef.current;
      containerRef.current.scrollTop += addedHeight;
      isLoadingMoreRef.current = false;
    }
  }, [messages]);

  // Infinite scroll: use an IntersectionObserver on a sentinel element
  // at the top of the list. When it becomes visible (= scrolled to top),
  // trigger loadMore. More reliable than scroll event handlers.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const sentinel = sentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            !loadingMore &&
            !isLoadingMoreRef.current
          ) {
            const c = containerRef.current;
            if (c) {
              prevScrollHeightRef.current = c.scrollHeight;
              isLoadingMoreRef.current = true;
              onLoadMore();
            }
          }
        }
      },
      {
        root: container,
        rootMargin: "400px 0px 0px 0px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadingMore, onLoadMore]);

  const turns = groupIntoTurns(messages);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-5"
    >
      {hasMore && (
        <div ref={sentinelRef} className="h-px" />
      )}
      {loadingMore && (
        <div className="text-center text-xs text-[var(--text-muted)] py-2 mb-3">
          Loading older messages...
        </div>
      )}
      {turns.map((msg) => (
        <div key={msg.id} data-message-id={msg.id}>
          <MessageBubble message={msg} />
        </div>
      ))}
      {streamState && streamState.phase !== "idle" && (
        <StreamingIndicator state={streamState} />
      )}
      <div ref={bottomRef} />
    </div>
  );
});
