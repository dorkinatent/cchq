"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { useMessagePagination } from "@/hooks/use-message-pagination";
import { useSessionStream } from "@/hooks/use-session-stream";
import { useMessageQueue } from "@/hooks/use-message-queue";
import { MessageList, type MessageListHandle } from "@/components/chat/message-list";
import { MessageInput, type Attachment } from "@/components/chat/message-input";
import { SessionContextPanel } from "@/components/chat/session-context-panel";
import { ConnectionStatus } from "@/components/chat/connection-status";
import { MessageStatus } from "@/components/chat/message-status";
import { ResumePanel } from "@/components/chat/resume-panel";
import { SessionSummary } from "@/components/chat/session-summary";
import { SessionSearch } from "@/components/chat/session-search";

type SessionDetail = {
  id: string;
  name: string;
  status: string;
  model: string;
  effort?: string;
  projectId: string;
  projectName?: string;
  projectPath?: string;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  createdAt?: string;
  updatedAt?: string;
};

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { messages, loading, loadingMore, hasMore, loadMore } =
    useMessagePagination(id);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const messageListRef = useRef<MessageListHandle>(null);

  const isActive = session?.status === "active";
  const streamState = useSessionStream(id, !!isActive);
  const queue = useMessageQueue(id);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then(setSession);
  }, [id]);

  // Refresh session details when a message completes or result arrives (to get updated usage)
  useEffect(() => {
    if (streamState.completedMessage || streamState.resultReceived) {
      fetch(`/api/sessions/${id}`)
        .then((r) => r.json())
        .then(setSession);
    }
  }, [streamState.completedMessage, streamState.resultReceived, id]);

  const phaseLabel = {
    idle: null,
    thinking: "Thinking...",
    tool_use: "Using tools...",
    streaming: "Writing...",
    error: "Error",
  }[streamState.phase];

  // Fallback onSend (not used when enqueue is provided, but kept for type compat)
  function handleSend(content: string, _attachments?: Attachment[]) {
    queue.enqueue(content, _attachments?.map((a) => ({ path: a.path, name: a.name })));
  }

  async function handleComplete() {
    await fetch(`/api/sessions/${id}/complete`, { method: "POST" });
    setSession((s) => (s ? { ...s, status: "completed" } : s));
  }

  async function handlePause() {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    setSession((s) => (s ? { ...s, status: "paused" } : s));
  }

  async function handleResume(note?: string) {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active", resumeNote: note }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSession((s) => (s ? { ...s, ...updated, status: "active" } : s));
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[12px] shrink-0"
            aria-label="Back to dashboard"
          >
            &larr;
          </Link>
          <h1 className="text-[19px] font-semibold tracking-tight text-[var(--text-primary)] leading-tight truncate">
            {session?.name || "Loading…"}
          </h1>
          {session && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${
                isActive
                  ? "bg-[var(--active-bg)] text-[var(--active-text)]"
                  : session.status === "paused"
                  ? "bg-[var(--paused-bg)] text-[var(--paused-text)]"
                  : "bg-[var(--completed-bg)] text-[var(--completed-text)]"
              }`}
            >
              {session.status}
            </span>
          )}
          {isActive && (
            <ConnectionStatus status={streamState.connectionStatus} />
          )}
          {phaseLabel && (
            <span className="text-[11px] text-[var(--accent)] animate-pulse">
              {phaseLabel}
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center text-xs text-[var(--text-secondary)]">
          <SessionSearch
            sessionId={id}
            onJumpToMessage={(messageId) =>
              messageListRef.current?.scrollToMessage(messageId)
            }
          />
          {session?.usage && (
            <span className="text-[var(--text-muted)] mr-2">
              {session.usage.totalTokens.toLocaleString()} tokens · ${session.usage.totalCostUsd.toFixed(4)}
            </span>
          )}
          {session?.model}
          {isActive && (
            <>
              <button
                onClick={handlePause}
                className="ml-3 px-2.5 py-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Pause
              </button>
              <button
                onClick={handleComplete}
                className="px-2.5 py-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Complete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
              Loading messages...
            </div>
          ) : (
            <MessageList
              ref={messageListRef}
              messages={messages}
              streamState={streamState}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
            />
          )}
          {/* Queued / failed message status indicators */}
          {queue.messages.filter((m) => m.status !== "sent").length > 0 && (
            <div className="px-5 py-2 space-y-1 border-t border-[var(--border)]">
              {queue.messages
                .filter((m) => m.status !== "sent")
                .map((m) => (
                  <div key={m.id} className="flex items-start gap-2">
                    <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">
                      {m.content.slice(0, 60)}
                      {m.content.length > 60 ? "..." : ""}
                    </span>
                    <MessageStatus
                      message={m}
                      onRetry={() => queue.retry(m.id)}
                      onRemove={() => queue.remove(m.id)}
                    />
                  </div>
                ))}
            </div>
          )}
          {session?.status === "paused" ? (
            <ResumePanel
              sessionId={id}
              projectId={session.projectId}
              pausedAt={session.updatedAt || new Date().toISOString()}
              onResume={handleResume}
            />
          ) : session?.status === "completed" || session?.status === "errored" ? (
            <SessionSummary
              sessionId={id}
              model={session.model}
              usage={session.usage}
              createdAt={session.createdAt || session.updatedAt || new Date().toISOString()}
              endedAt={session.updatedAt || new Date().toISOString()}
            />
          ) : (
            <MessageInput
              onSend={handleSend}
              enqueue={queue.enqueue}
              sessionId={id}
              disabled={!isActive || streamState.phase !== "idle"}
            />
          )}
        </div>

        {session && (
          <SessionContextPanel
            sessionId={id}
            projectId={session.projectId}
            projectPath={session.projectPath || ""}
            model={session.model}
            effort={session.effort}
            messageCount={messages.length}
            usage={session.usage}
          />
        )}
      </div>
    </div>
  );
}
