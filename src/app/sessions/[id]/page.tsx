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
import { MobileContextSheet } from "@/components/chat/mobile-context-sheet";
import { ToolErrorNoticeList } from "@/components/chat/tool-error-notice";
import { useContextPanel } from "@/hooks/use-context-panel";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useToast } from "@/components/ui/toast";
import type { CommandResult } from "@/types/command-result";

type SessionDetail = {
  id: string;
  name: string;
  status: string;
  model: string;
  effort?: string;
  trustLevel?: string;
  projectId: string;
  projectName?: string;
  projectPath?: string;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  createdAt?: string;
  updatedAt?: string;
  startSha?: string | null;
  endSha?: string | null;
};

function MobileOverflowMenu({
  isActive,
  onPause,
  onComplete,
}: {
  isActive: boolean;
  onPause: () => void;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Session actions"
        className="flex items-center justify-center min-h-11 min-w-11 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)]"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-12 right-0 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md shadow-lg z-20 py-1 min-w-[200px]">
            {isActive && (
              <>
                <button
                  onClick={() => { setOpen(false); onPause(); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface)]"
                >
                  Pause session
                </button>
                <button
                  onClick={() => { setOpen(false); onComplete(); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface)]"
                >
                  End session
                </button>
                <div className="my-1 border-t border-[var(--border)]" />
              </>
            )}
            <div className="px-3 pb-2">
              <ThemeSwitcher />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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
  const [commandMessages, setCommandMessages] = useState<
    import("@/hooks/use-session-messages").Message[]
  >([]);
  const cmdIdRef = useRef(0);

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
  const [mobileContextOpen, setMobileContextOpen] = useState(false);

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

  // Track /compact completion via stream state
  useEffect(() => {
    if (streamState.completedMessage) {
      setCommandMessages((prev) =>
        prev.map((m) =>
          m.commandResult?.command === "compact" && m.commandResult.status === "running"
            ? { ...m, commandResult: { command: "compact" as const, status: "done" as const, message: "Conversation compacted." } }
            : m
        )
      );
    }
  }, [streamState.completedMessage]);

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

  function handleSlashCommand(command: string, args: string) {
    const msgId = `cmd-${++cmdIdRef.current}-${Date.now()}`;
    const now = new Date().toISOString();

    // Insert the user's command as a visible user message
    const userMsg: import("@/hooks/use-session-messages").Message = {
      id: `${msgId}-user`,
      session_id: id,
      role: "user",
      content: `/${command}${args ? " " + args : ""}`,
      tool_use: null,
      thinking: null,
      created_at: now,
    };

    // Create the command result message
    const cmdMsg: import("@/hooks/use-session-messages").Message = {
      id: msgId,
      session_id: id,
      role: "system",
      content: "",
      tool_use: null,
      thinking: null,
      created_at: now,
      commandResult: buildInitialResult(command),
    };

    setCommandMessages((prev) => [...prev, userMsg, cmdMsg]);

    // /compact also sends through to the SDK
    if (command === "compact") {
      queue.enqueue(`/compact${args ? " " + args : ""}`);
    }

    // Fetch data and update the command message
    fetchCommandData(command, args, msgId);
  }

  function buildInitialResult(command: string): CommandResult {
    switch (command) {
      case "cost":
        return {
          command: "cost",
          status: "loaded",
          data: session?.usage ?? { totalTokens: 0, totalCostUsd: 0, numTurns: 0 },
        };
      case "model":
        return { command: "model", status: "loading" };
      case "mcp":
        return { command: "mcp", status: "loading" };
      case "status":
        return { command: "status", status: "loading" };
      case "permissions":
        return { command: "permissions", status: "loading" };
      case "compact":
        return { command: "compact", status: "running" };
      case "config":
        return { command: "config", status: "loading" };
      default:
        return { command: "cost", status: "loaded", data: { totalTokens: 0, totalCostUsd: 0, numTurns: 0 } };
    }
  }

  function updateCommandMessage(msgId: string, result: CommandResult) {
    setCommandMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, commandResult: result } : m))
    );
  }

  async function fetchCommandData(command: string, args: string, msgId: string) {
    try {
      switch (command) {
        case "cost":
          // Already loaded from session.usage — no fetch needed
          break;

        case "model": {
          const res = await fetch(`/api/sessions/${id}/models`);
          if (!res.ok) throw new Error("Failed to fetch models");
          const { models } = await res.json();
          updateCommandMessage(msgId, {
            command: "model",
            status: "loaded",
            data: {
              currentModel: session?.model ?? "",
              currentEffort: session?.effort,
              availableModels: models,
            },
          });
          break;
        }

        case "mcp": {
          const res = await fetch(`/api/sessions/${id}/mcp`);
          if (!res.ok) throw new Error("Failed to fetch MCP servers");
          const { servers } = await res.json();
          updateCommandMessage(msgId, {
            command: "mcp",
            status: "loaded",
            data: { servers },
          });
          break;
        }

        case "status": {
          const res = await fetch(`/api/sessions/${id}/status`);
          if (!res.ok) throw new Error("Failed to fetch status");
          const data = await res.json();
          updateCommandMessage(msgId, {
            command: "status",
            status: "loaded",
            data,
          });
          break;
        }

        case "permissions": {
          const res = await fetch(`/api/sessions/${id}/status?kind=permissions`);
          if (!res.ok) throw new Error("Failed to fetch permissions");
          const data = await res.json();
          updateCommandMessage(msgId, {
            command: "permissions",
            status: "loaded",
            data,
          });
          break;
        }

        case "compact":
          // Handled via SDK pass-through; card starts as "running"
          break;

        case "config": {
          const [modelsRes, permRes] = await Promise.all([
            fetch(`/api/sessions/${id}/models`),
            fetch(`/api/sessions/${id}/status?kind=permissions`),
          ]);
          if (!modelsRes.ok) throw new Error("Failed to fetch models");
          if (!permRes.ok) throw new Error("Failed to fetch permissions");
          const { models } = await modelsRes.json();
          const permData = await permRes.json();
          updateCommandMessage(msgId, {
            command: "config",
            status: "loaded",
            data: {
              model: session?.model ?? "",
              effort: session?.effort,
              trustLevel: permData.trustLevel ?? "auto_log",
              availableModels: models,
            },
          });
          break;
        }
      }
    } catch {
      updateCommandMessage(msgId, {
        command,
        status: "error",
        error: "Could not fetch \u2014 session may be disconnected",
      } as CommandResult);
    }
  }

  function handleSessionUpdateFromCommand() {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then(setSession);
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
    <div className="flex flex-col h-full overflow-hidden max-w-full">
      <header className="fixed top-0 left-0 right-0 md:static z-30 bg-[var(--bg)] flex items-center gap-3 md:gap-6 px-4 md:px-7 py-2 md:py-5 border-b border-[var(--border)] shrink-0">
        {/* Identity group: back, title, state */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href="/"
            className="flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:min-w-0 md:block text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[14px] shrink-0"
            aria-label="Back to dashboard"
          >
            &larr;
          </Link>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)] leading-tight truncate max-w-[60vw] md:max-w-none">
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
          <div className="hidden md:flex items-center gap-3 text-[11px] text-[var(--text-muted)] shrink-0">
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

        {/* Actions group — desktop only */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <SessionSearch
            sessionId={id}
            onJumpToMessage={(messageId) =>
              messageListRef.current?.scrollToMessage(messageId)
            }
          />
          <RememberButton sessionId={id} />
          {isActive && (
            <div className="flex items-center gap-2">
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
            </div>
          )}
          <span className="hidden lg:inline-block w-px h-5 bg-[var(--border)] mx-1" aria-hidden />
          <button
            onClick={togglePanel}
            className="hidden lg:inline-flex px-2 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] rounded transition-colors"
            aria-label={panelOpen ? "Hide context panel" : "Show context panel"}
            title={panelOpen ? "Hide context panel" : "Show context panel"}
          >
            {panelOpen ? "›│" : "│‹"}
          </button>
        </div>

        {/* Mobile overflow menu — mobile only */}
        <div className="md:hidden flex items-center gap-1">
          <button
            onClick={() => setMobileContextOpen(true)}
            className="lg:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Session info"
            title="Context, Docs, Notes, Changes"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="9" cy="9" r="7.5" />
              <line x1="9" y1="8" x2="9" y2="13" />
              <circle cx="9" cy="5.5" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <MobileOverflowMenu
            isActive={isActive}
            onPause={handlePause}
            onComplete={handleComplete}
          />
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
                  messages={[...messages, ...commandMessages]}
                  streamState={streamState}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={loadMore}
                  sessionId={id}
                  onSessionUpdate={handleSessionUpdateFromCommand}
                />
              </div>
              {mainOverlay && session && (
                <SessionMainOverlay
                  overlay={mainOverlay}
                  projectId={session.projectId}
                  sessionId={id}
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
              startSha={session.startSha}
              onReviewChanges={() => setMainOverlay({ kind: "diff", mode: "saved" })}
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
                onSlashCommand={handleSlashCommand}
              />
            </>
          )}
        </div>

        {session && panelOpen && !mainOverlay && (
          <div className="hidden lg:flex">
            <SessionContextPanel
              sessionId={id}
              sessionStatus={session.status}
              startSha={session.startSha}
              endSha={session.endSha}
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

      {/* Mobile context sheet — slide-in from right on small screens */}
      {session && (
        <MobileContextSheet
          open={mobileContextOpen}
          onClose={() => setMobileContextOpen(false)}
          sessionId={id}
          sessionStatus={session.status}
          startSha={session.startSha}
          endSha={session.endSha}
          projectId={session.projectId}
          projectPath={session.projectPath || ""}
          model={session.model}
          effort={session.effort}
          messageCount={messages.length}
          usage={session.usage}
          onExpandToMain={setMainOverlay}
        />
      )}
    </div>
  );
}
