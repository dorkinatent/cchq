"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { IngestionPrompt } from "@/components/project/ingestion-prompt";
import { useMessagePagination } from "@/hooks/use-message-pagination";
import { useSessionStream } from "@/hooks/use-session-stream";
import { useMessageQueue } from "@/hooks/use-message-queue";
import { MessageList, type MessageListHandle } from "@/components/chat/message-list";
import { MessageInput, type Attachment } from "@/components/chat/message-input";
import { SessionContextPanel, type MainOverlay } from "@/components/chat/session-context-panel";
import { SessionMainOverlay } from "@/components/chat/main-overlay";
import { ConnectionStatus } from "@/components/chat/connection-status";
import { MessageStatus } from "@/components/chat/message-status";
import { ResumePanel } from "@/components/chat/resume-panel";
import { SessionSummary } from "@/components/chat/session-summary";
import { SessionSearch } from "@/components/chat/session-search";
import { RememberButton } from "@/components/chat/remember-button";
import { PermissionCard, type PermissionResponse } from "@/components/chat/permission-card";
import { ToolErrorNoticeList } from "@/components/chat/tool-error-notice";
import { useContextPanel } from "@/hooks/use-context-panel";
import { useToast } from "@/components/ui/toast";

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const ingestProjectId = searchParams.get("ingest");
  const ingestCount = Number(searchParams.get("count") || "0");
  const [ingestDismissed, setIngestDismissed] = useState(false);
  const { messages, loading, loadingMore, hasMore, loadMore } =
    useMessagePagination(id);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [mainOverlay, setMainOverlay] = useState<MainOverlay>(null);
  const messageListRef = useRef<MessageListHandle>(null);

  function dismissIngestBanner() {
    setIngestDismissed(true);
    // Strip the query params so a refresh doesn't re-show.
    router.replace(`/sessions/${id}`);
  }

  const isActive = session?.status === "active";
  // Connect SSE eagerly — don't wait for session metadata to arrive, or we'll
  // miss the initial thinking_start event on freshly-created sessions.
  // We still only show controls / enable input based on isActive.
  const streamState = useSessionStream(id, true);
  const queue = useMessageQueue(id);
  const { toast } = useToast();
  const { open: panelOpen, toggle: togglePanel } = useContextPanel(true);

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

  const isBusy = streamState.phase !== "idle" && streamState.phase !== "error";

  // Esc while the turn is in flight interrupts without ending the session.
  // Ignores Esc when an input/textarea has focus (they own Esc for their own UX).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (!isBusy) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      handleInterrupt();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isBusy]);

  // Fallback onSend (not used when enqueue is provided, but kept for type compat)
  function handleSend(content: string, _attachments?: Attachment[]) {
    queue.enqueue(content, _attachments?.map((a) => ({ path: a.path, name: a.name })));
  }

  async function handlePermissionRespond(response: PermissionResponse) {
    // Fire-and-forget the API call — we don't need to block on the response
    // since the server-side promise resolution continues the SDK turn.
    fetch(`/api/sessions/${id}/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    }).catch(() => {});

    // Give the user a brief moment to see the checkmark, then remove the card.
    setTimeout(() => {
      streamState.dismissPermission(response.requestId);
    }, 700);
  }

  async function handleComplete() {
    await fetch(`/api/sessions/${id}/complete`, { method: "POST" });
    setSession((s) => (s ? { ...s, status: "completed" } : s));
  }

  async function handleInterrupt() {
    try {
      const res = await fetch(`/api/sessions/${id}/interrupt`, { method: "POST" });
      if (res.ok) {
        toast("Turn interrupted");
      } else {
        toast("Interrupt failed", { variant: "error" });
      }
    } catch {
      toast("Interrupt failed", { variant: "error" });
    }
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
      <header className="flex items-center gap-6 px-7 py-5 border-b border-[var(--border)] shrink-0">
        {/* Identity group: back, title, state */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href="/"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[14px] shrink-0"
            aria-label="Back to dashboard"
          >
            &larr;
          </Link>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)] leading-tight truncate">
            {session?.name || "Loading…"}
          </h1>
          {session && (
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                isActive
                  ? "bg-[var(--active-bg)] text-[var(--active-text)]"
                  : session.status === "paused"
                  ? "bg-[var(--paused-bg)] text-[var(--paused-text)]"
                  : session.status === "errored"
                  ? "bg-[var(--errored-bg)] text-[var(--errored-text)]"
                  : "bg-[var(--completed-bg)] text-[var(--completed-text)]"
              }`}
            >
              {session.status}
            </span>
          )}
        </div>

        {/* Live status group — only while active */}
        {isActive && (phaseLabel || streamState.connectionStatus) && (
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] shrink-0">
            <ConnectionStatus status={streamState.connectionStatus} />
            {phaseLabel && (
              <span className="flex items-center gap-1.5 text-[var(--accent)]">
                <span className="flex gap-1" aria-hidden>
                  <span className="w-1 h-1 bg-[var(--accent)] rounded-full thinking-dot" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 bg-[var(--accent)] rounded-full thinking-dot" style={{ animationDelay: "200ms" }} />
                  <span className="w-1 h-1 bg-[var(--accent)] rounded-full thinking-dot" style={{ animationDelay: "400ms" }} />
                </span>
                {phaseLabel.replace("...", "")}
              </span>
            )}
          </div>
        )}

        {/* Actions group */}
        <div className="flex items-center gap-2 shrink-0">
          <SessionSearch
            sessionId={id}
            onJumpToMessage={(messageId) =>
              messageListRef.current?.scrollToMessage(messageId)
            }
          />
          <RememberButton sessionId={id} />
          {isActive && (
            <>
              <span className="w-px h-5 bg-[var(--border)] mx-1" aria-hidden />
              <button
                onClick={handlePause}
                className="px-2.5 py-1 text-[12px] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                Pause
              </button>
              <button
                onClick={handleComplete}
                className="px-2.5 py-1 text-[12px] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                title="Mark this session done. You can still view its history, but not resume it."
              >
                End session
              </button>
            </>
          )}
          <span className="w-px h-5 bg-[var(--border)] mx-1" aria-hidden />
          <button
            onClick={togglePanel}
            className="px-2 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] rounded transition-colors"
            aria-label={panelOpen ? "Hide context panel" : "Show context panel"}
            title={panelOpen ? "Hide context panel" : "Show context panel"}
          >
            {panelOpen ? "›│" : "│‹"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1">
          {ingestProjectId && ingestCount > 0 && !ingestDismissed && (
            <div className="px-5 pt-4">
              <IngestionPrompt
                projectId={ingestProjectId}
                fileCount={ingestCount}
                onClose={dismissIngestBanner}
              />
            </div>
          )}
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
              Loading messages...
            </div>
          ) : (
            <>
              {/* Keep MessageList mounted so scroll + stream state persist
                  when the user expands a doc/note into the main column. */}
              <div
                className={mainOverlay ? "hidden" : "flex flex-col flex-1 min-h-0"}
                aria-hidden={mainOverlay ? true : undefined}
              >
                <MessageList
                  ref={messageListRef}
                  messages={messages}
                  streamState={streamState}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={loadMore}
                />
              </div>
              {mainOverlay && session && (
                <SessionMainOverlay
                  overlay={mainOverlay}
                  projectId={session.projectId}
                  onClose={() => setMainOverlay(null)}
                />
              )}
            </>
          )}
          {/* Silent tool failures surfaced to the user */}
          {session && (
            <ToolErrorNoticeList
              errors={streamState.toolErrors}
              projectId={session.projectId}
              onDismiss={streamState.dismissToolError}
            />
          )}
          {/* Pending permission requests */}
          {streamState.pendingPermissions.length > 0 && (
            <div className="px-5 py-3 space-y-3 border-t border-[var(--border)] bg-[var(--paused-bg)]/30">
              {streamState.pendingPermissions.map((p) => (
                <PermissionCard
                  key={p.id}
                  request={{
                    id: p.id,
                    toolName: p.toolName,
                    input: p.input,
                  }}
                  onRespond={handlePermissionRespond}
                />
              ))}
            </div>
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
          ) : session?.status === "completed" ? (
            <SessionSummary
              sessionId={id}
              model={session.model}
              usage={session.usage}
              createdAt={session.createdAt || session.updatedAt || new Date().toISOString()}
              endedAt={session.updatedAt || new Date().toISOString()}
            />
          ) : (
            <>
              {session?.status === "errored" && (
                <div className="mx-5 mt-3 bg-[var(--errored-bg)] border border-[var(--errored-border)] rounded-lg px-4 py-3 text-sm">
                  <div className="text-[var(--errored-text)] font-medium mb-1">
                    Session ended with an error.
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Type a message below to retry — the session will resume from where it left off.
                  </div>
                </div>
              )}
              <MessageInput
                onSend={handleSend}
                enqueue={queue.enqueue}
                sessionId={id}
                disabled={!isActive && session?.status !== "errored"}
                busy={isActive && isBusy}
                onInterrupt={handleInterrupt}
              />
            </>
          )}
        </div>

        {session && panelOpen && !mainOverlay && (
          <div className="hidden lg:flex">
            <SessionContextPanel
              sessionId={id}
              projectId={session.projectId}
              projectPath={session.projectPath || ""}
              model={session.model}
              effort={session.effort}
              messageCount={messages.length}
              usage={session.usage}
              onExpandToMain={setMainOverlay}
            />
          </div>
        )}
      </div>
    </div>
  );
}
