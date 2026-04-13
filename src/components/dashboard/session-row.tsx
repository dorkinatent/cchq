"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OverviewSession } from "@/app/api/sessions/overview/route";
import { relativeTime } from "@/lib/relative-time";
import {
  phaseLabel,
  toolInputPreview,
} from "./phase-label";

const DOT_BY_BUCKET: Record<string, string> = {
  blocked: "bg-[var(--errored-text)]",
  streaming: "bg-[var(--accent)]",
  idle_active: "bg-[var(--active-text)]",
  paused: "bg-[var(--paused-text)]",
  errored: "bg-[var(--errored-text)]",
  completed: "bg-[var(--text-muted)]",
};

function dotClass(s: OverviewSession): string {
  if (s.blockedInfo) return DOT_BY_BUCKET.blocked;
  if (s.liveState?.hasActiveQuery) return DOT_BY_BUCKET.streaming;
  if (s.status === "paused") return DOT_BY_BUCKET.paused;
  if (s.status === "errored") return DOT_BY_BUCKET.errored;
  if (s.status === "completed") return DOT_BY_BUCKET.completed;
  return DOT_BY_BUCKET.idle_active;
}

export function SessionRow({
  session,
  queuedCount,
  expanded,
  onToggle,
  onRefresh,
  selected,
  onToggleSelect,
  selectDisabled,
}: {
  session: OverviewSession;
  queuedCount: number;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  selectDisabled: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const isBusy = session.liveState?.hasActiveQuery === true;
  const isPulsing = isBusy || session.blockedInfo != null;

  // Live "Thinking Ns" counter — only tick while busy, and only if expanded
  // or currently streaming in the row.
  useEffect(() => {
    if (!isBusy) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isBusy]);

  const phase = phaseLabel(session, now, queuedCount);
  const cost = session.usage?.totalCostUsd ?? 0;

  const detailsId = `row-${session.id}-details`;

  function onRowKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <div className="group border-b border-[var(--border)]/60 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={`${expanded ? "Collapse" : "Expand"} details for ${session.name}`}
        className="flex items-center gap-3 px-3 h-10 hover:bg-[var(--surface)]/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
        onClick={onToggle}
        onKeyDown={onRowKeyDown}
      >
        <label
          onClick={(e) => e.stopPropagation()}
          className={
            "shrink-0 flex items-center justify-center w-4 h-4 rounded cursor-pointer transition-opacity focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-0 " +
            (selected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-70 focus-within:opacity-100")
          }
          title={
            selectDisabled
              ? "Workspace limit reached (6)"
              : selected
              ? "Remove from workspace selection"
              : "Select for workspace"
          }
        >
          <input
            type="checkbox"
            checked={selected}
            disabled={selectDisabled && !selected}
            onChange={onToggleSelect}
            className="accent-[var(--accent)] w-3.5 h-3.5 focus-visible:outline-none"
            aria-label="Select for workspace"
          />
        </label>
        <span
          aria-hidden
          className={
            "w-1.5 h-1.5 rounded-full shrink-0 " +
            dotClass(session) +
            (isPulsing ? " thinking-dot" : "")
          }
        />
        <Link
          href={`/sessions/${session.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] truncate max-w-[24ch]"
        >
          {session.name}
        </Link>
        <span
          className={
            "text-xs truncate flex-1 " +
            (phase.tone === "streaming"
              ? "text-[var(--accent)]"
              : phase.tone === "blocked"
              ? "text-[var(--errored-text)]"
              : phase.tone === "muted"
              ? "text-[var(--text-muted)]"
              : "text-[var(--text-secondary)]")
          }
        >
          {phase.text}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap w-14 text-right">
          {relativeTime(session.updatedAt)}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap w-14 text-right">
          {cost > 0 ? `$${cost.toFixed(2)}` : "—"}
        </span>
        <span
          aria-hidden
          className={
            "text-[var(--text-muted)] text-xs w-4 text-center transition-transform " +
            (expanded ? "rotate-90" : "")
          }
        >
          ›
        </span>
      </div>
      {expanded && (
        <div id={detailsId}>
          <ExpandedRow session={session} onRefresh={onRefresh} pushHome={() => router.push("/")} />
        </div>
      )}
    </div>
  );
}

function ExpandedRow({
  session,
  onRefresh,
  pushHome,
}: {
  session: OverviewSession;
  onRefresh: () => void;
  pushHome: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const isBusy = session.liveState?.hasActiveQuery === true;

  async function post(path: string, label: string) {
    if (busy) return;
    setBusy(label);
    try {
      await fetch(path, { method: "POST" });
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  const tool = session.liveState?.currentToolName;
  const toolPreview = toolInputPreview(session.liveState?.currentToolInput ?? null);
  const last = session.lastMessage;

  return (
    <div className="px-5 py-3 bg-[var(--surface)]/40 border-t border-[var(--border)]/60">
      <div className="grid grid-cols-[1fr_auto] gap-6">
        <div className="space-y-2 min-w-0">
          {tool && (
            <div>
              <div className="eyebrow text-[var(--text-muted)] mb-0.5">Current tool</div>
              <div className="text-xs font-mono text-[var(--text-primary)] truncate">
                {tool}
                {toolPreview ? (
                  <>
                    <span className="text-[var(--text-muted)]">: </span>
                    <span className="text-[var(--text-secondary)]">{toolPreview}</span>
                  </>
                ) : null}
              </div>
            </div>
          )}
          {last && (
            <div>
              <div className="eyebrow text-[var(--text-muted)] mb-0.5">
                Last {last.role}
              </div>
              <div className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-snug">
                {last.content || <span className="italic text-[var(--text-muted)]">(no text)</span>}
              </div>
            </div>
          )}
          {!last && !tool && (
            <div className="text-xs text-[var(--text-muted)] italic">
              No recent activity.
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 text-xs">
          <Link
            href={`/sessions/${session.id}`}
            className="px-2.5 py-1 rounded bg-[var(--accent)] text-[var(--bg)] font-semibold hover:bg-[var(--accent-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
          >
            Open
          </Link>
          {isBusy && (
            <button
              disabled={busy !== null}
              onClick={() => post(`/api/sessions/${session.id}/interrupt`, "interrupt")}
              className="px-2.5 py-1 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              {busy === "interrupt" ? "Interrupting…" : "Interrupt"}
            </button>
          )}
          {session.status === "active" && (
            <button
              disabled={busy !== null}
              onClick={() =>
                fetch(`/api/sessions/${session.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "paused" }),
                }).then(onRefresh)
              }
              className="px-2.5 py-1 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              Pause
            </button>
          )}
          {confirmEnd ? (
            <div className="flex gap-1">
              <button
                disabled={busy !== null}
                onClick={() =>
                  post(`/api/sessions/${session.id}/complete`, "end").then(() => {
                    setConfirmEnd(false);
                    pushHome();
                  })
                }
                className="px-2.5 py-1 rounded bg-[var(--errored-bg)] text-[var(--errored-text)] border border-[var(--errored-border)] hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
              >
                {busy === "end" ? "Ending…" : "Confirm end"}
              </button>
              <button
                onClick={() => setConfirmEnd(false)}
                className="px-2 py-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmEnd(true)}
              className="px-2.5 py-1 rounded text-[var(--text-muted)] hover:text-[var(--errored-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              End session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
