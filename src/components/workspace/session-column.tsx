"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMessagePagination } from "@/hooks/use-message-pagination";
import { useSessionStream } from "@/hooks/use-session-stream";
import { useMessageQueue } from "@/hooks/use-message-queue";
import {
  MessageList,
  type MessageListHandle,
} from "@/components/chat/message-list";
import { MessageInput, type Attachment } from "@/components/chat/message-input";
import {
  PermissionCard,
  type PermissionResponse,
} from "@/components/chat/permission-card";
import { ToolErrorNoticeList } from "@/components/chat/tool-error-notice";
import { useToast } from "@/components/ui/toast";

type SessionDetail = {
  id: string;
  name: string;
  status: "active" | "paused" | "completed" | "errored";
  model: string;
  projectId: string;
  projectName?: string;
  projectPath?: string;
  updatedAt?: string;
  createdAt?: string;
};

const DOT_BY_STATUS: Record<string, string> = {
  active: "bg-[var(--active-text)]",
  paused: "bg-[var(--paused-text)]",
  errored: "bg-[var(--errored-text)]",
  completed: "bg-[var(--text-muted)]",
};

export function SessionColumn({
  sessionId,
  focused,
  onFocus,
  onClose,
  flexGrow,
  now,
}: {
  sessionId: string;
  focused: boolean;
  onFocus: () => void;
  onClose: () => void;
  /** Allow the column to stretch to fill available horizontal space. */
  flexGrow: boolean;
  now: number;
}) {
  const { messages, loading, loadingMore, hasMore, loadMore } =
    useMessagePagination(sessionId);
  const streamState = useSessionStream(sessionId, true);
  const queue = useMessageQueue(sessionId);
  const { toast } = useToast();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const messageListRef = useRef<MessageListHandle>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Single session-detail fetch effect. Re-runs on completion/result so the
  // status can update, but uses AbortController so out-of-order resolutions
  // can't clobber fresh data.
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    fetch(`/api/sessions/${sessionId}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setSession(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [sessionId, streamState.completedMessage, streamState.resultReceived]);

  // Clear any pending dismissal timers on unmount so a delayed
  // dismissPermission call can't leak into a remounted column.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const isBusy =
    streamState.phase !== "idle" && streamState.phase !== "error";
  const isActive = session?.status === "active";

  const phase = phaseLabelFromStream(streamState, now);

  function handleSend(content: string, atts?: Attachment[]) {
    queue.enqueue(
      content,
      atts?.map((a) => ({ path: a.path, name: a.name }))
    );
  }

  async function handlePermissionRespond(response: PermissionResponse) {
    fetch(`/api/sessions/${sessionId}/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    }).catch(() => {});
    const t = setTimeout(() => {
      streamState.dismissPermission(response.requestId);
      timersRef.current.delete(t);
    }, 700);
    timersRef.current.add(t);
  }

  async function handleInterrupt() {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/interrupt`, {
        method: "POST",
      });
      if (res.ok) toast("Turn interrupted");
      else toast("Interrupt failed", { variant: "error" });
    } catch {
      toast("Interrupt failed", { variant: "error" });
    }
  }

  const statusKey = session?.status ?? "active";
  const dotClass = DOT_BY_STATUS[statusKey] ?? DOT_BY_STATUS.active;

  return (
    <div
      onMouseDown={onFocus}
      onFocusCapture={onFocus}
      className={
        "flex flex-col h-full shrink-0 rounded-lg bg-[var(--surface)] border border-[var(--border)] transition-shadow overflow-hidden [overflow-anchor:none] " +
        (flexGrow ? "flex-1 min-w-[420px] " : "w-[480px] ") +
        (focused ? "ring-2 ring-[var(--accent)] " : "")
      }
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-2.5 border-b border-[var(--border)] shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className={
                "w-1.5 h-1.5 rounded-full shrink-0 " +
                dotClass +
                (isBusy ? " thinking-dot" : "")
              }
            />
            <span className="font-medium text-sm text-[var(--text-primary)] truncate">
              {session?.name ?? sessionId.slice(0, 8)}
            </span>
          </div>
          <div className="text-xs text-[var(--text-muted)] truncate mt-0.5 pl-3.5">
            {session?.projectName ?? session?.projectPath ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {phase && (
            <span
              className={
                "text-[11px] tabular-nums max-w-[18ch] truncate " +
                (phase.tone === "streaming"
                  ? "text-[var(--accent)]"
                  : phase.tone === "error"
                  ? "text-[var(--errored-text)]"
                  : "text-[var(--text-muted)]")
              }
              title={phase.text}
            >
              {phase.text}
            </span>
          )}
          <Link
            href={`/sessions/${sessionId}`}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--surface-raised)]"
            title="Open full session"
          >
            ↗ Open
          </Link>
          <button
            onClick={onClose}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--errored-text)] px-1.5 py-0.5 rounded hover:bg-[var(--surface-raised)]"
            title="Remove from workspace"
            aria-label="Close column"
          >
            × Close
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
            Loading messages…
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
      </div>

      {/* Tool error notices */}
      {session && (
        <ToolErrorNoticeList
          errors={streamState.toolErrors}
          projectId={session.projectId}
          onDismiss={streamState.dismissToolError}
        />
      )}

      {/* Permission cards */}
      {streamState.pendingPermissions.length > 0 && (
        <div className="px-3 py-2 space-y-2 border-t border-[var(--border)] bg-[var(--paused-bg)]/30">
          {streamState.pendingPermissions.map((p) => (
            <PermissionCard
              key={p.id}
              request={{ id: p.id, toolName: p.toolName, input: p.input }}
              onRespond={handlePermissionRespond}
            />
          ))}
        </div>
      )}

      {/* Input — only for active or errored (retry) sessions */}
      {session?.status === "paused" ? (
        <div className="px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
          Paused — open the full session to resume.
        </div>
      ) : session?.status === "completed" ? (
        <div className="px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
          Completed.
        </div>
      ) : (
        <MessageInput
          onSend={handleSend}
          enqueue={queue.enqueue}
          sessionId={sessionId}
          disabled={!isActive && session?.status !== "errored"}
          busy={isActive && isBusy}
          onInterrupt={handleInterrupt}
        />
      )}
    </div>
  );
}

function phaseLabelFromStream(
  s: ReturnType<typeof useSessionStream>,
  now: number
): { text: string; tone: "streaming" | "muted" | "error" } | null {
  if (s.phase === "idle") return { text: "Idle", tone: "muted" };
  if (s.phase === "error") return { text: "Error", tone: "error" };

  // Prefer the active tool name if present.
  const tool = s.activeTools.find((t) => !t.done) ?? s.activeTools[0];
  if (s.phase === "tool_use" && tool) {
    const preview = toolInputPreview(tool.input);
    return {
      text: preview
        ? `Using ${tool.toolName}: ${preview}`
        : `Using ${tool.toolName}`,
      tone: "streaming",
    };
  }

  if (s.phase === "thinking") {
    const started = s.thinkingStartedAt ?? now;
    const secs = Math.max(0, Math.round((now - started) / 1000));
    return { text: `Thinking ${secs}s`, tone: "streaming" };
  }

  if (s.phase === "streaming") return { text: "Writing…", tone: "streaming" };
  return null;
}

function toolInputPreview(input: Record<string, unknown> | null | undefined): string {
  if (!input) return "";
  const keys = ["command", "file_path", "path", "url", "pattern", "query"];
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 32);
  }
  return "";
}
