"use client";

import { useEffect, useState } from "react";

type Usage = { totalTokens: number; totalCostUsd: number; numTurns: number } | null | undefined;

type Stats = {
  totalToolCalls: number;
  topTools: { name: string; count: number }[];
  filesTouched: string[];
  filesRead: number;
  filesWritten: number;
};

function formatDuration(startIso: string, endIso: string): string {
  const ms = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatEndTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="eyebrow">{label}</div>
      <div className="font-semibold text-[var(--text-primary)] text-[19px] leading-none tabular-nums tracking-tight">
        {value}
      </div>
      {hint && <div className="text-[11px] text-[var(--text-muted)] tabular-nums">{hint}</div>}
    </div>
  );
}

export function SessionSummary({
  sessionId,
  model,
  usage,
  createdAt,
  endedAt,
  startSha,
  onReviewChanges,
}: {
  sessionId: string;
  model: string;
  usage: Usage;
  createdAt: string;
  endedAt: string;
  startSha?: string | null;
  onReviewChanges?: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [showFiles, setShowFiles] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sessions/${sessionId}/stats`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setStats(data as Stats);
      })
      .catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const duration = formatDuration(createdAt, endedAt);
  const ended = formatEndTimestamp(endedAt);
  const cost = usage?.totalCostUsd ?? 0;
  const tokens = usage?.totalTokens ?? 0;
  const turns = usage?.numTurns ?? 0;

  // Compact "14 Read · 8 Edit · 6 Bash · +12 other" line.
  const toolsLine = (() => {
    if (!stats || stats.totalToolCalls === 0) return "No tool calls";
    const shown = stats.topTools.slice(0, 3);
    const shownTotal = shown.reduce((a, t) => a + t.count, 0);
    const rest = stats.totalToolCalls - shownTotal;
    const parts = shown.map((t) => `${t.count} ${t.name}`);
    if (rest > 0) parts.push(`+${rest} other`);
    return parts.join(" · ");
  })();

  return (
    <div className="px-5 pt-2 pb-6">
    <section
      aria-label="Session summary"
      className="max-w-[min(96%,720px)] border border-[var(--border)] rounded-md overflow-hidden bg-[color-mix(in_oklch,var(--surface-raised)_50%,transparent)]"
    >
      {/* Closing log entry header */}
      <header className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] border border-[var(--text-muted)]"
          />
          <span className="eyebrow text-[var(--text-secondary)]">Session closed</span>
        </div>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{ended}</span>
      </header>

      {/* Primary stats row */}
      <div className="px-4 py-3 grid grid-cols-4 gap-4 border-t border-[var(--border)]">
        <Stat label="Duration" value={duration} />
        <Stat label="Turns" value={turns.toLocaleString()} />
        <Stat
          label="Tokens"
          value={tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString()}
          hint={tokens >= 1000 ? tokens.toLocaleString() : undefined}
        />
        <Stat label="Cost" value={`$${cost.toFixed(2)}`} hint={cost > 0 ? `$${cost.toFixed(4)}` : undefined} />
      </div>

      {/* Activity row */}
      <div className="px-4 py-3 border-t border-[var(--border)] grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <div className="eyebrow pt-[3px]">Tools</div>
        <div className="text-[13px] text-[var(--text-primary)]">
          {stats ? (
            <>
              <span className="tabular-nums font-semibold">{stats.totalToolCalls}</span>
              <span className="text-[var(--text-secondary)]"> · {toolsLine}</span>
            </>
          ) : (
            <span className="text-[var(--text-muted)]">counting…</span>
          )}
        </div>

        <div className="eyebrow pt-[3px]">Files</div>
        <div className="text-[13px] text-[var(--text-primary)]">
          {stats ? (
            <>
              <span className="tabular-nums font-semibold">{stats.filesTouched.length}</span>
              <span className="text-[var(--text-secondary)]">
                {" "}
                touched{stats.filesRead > 0 && ` · ${stats.filesRead} read`}
                {stats.filesWritten > 0 && ` · ${stats.filesWritten} edited`}
              </span>
              {stats.filesTouched.length > 0 && (
                <button
                  onClick={() => setShowFiles((s) => !s)}
                  className="ml-2 text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
                >
                  {showFiles ? "hide" : "show"}
                </button>
              )}
            </>
          ) : (
            <span className="text-[var(--text-muted)]">counting…</span>
          )}
        </div>

        {showFiles && stats && (
          <>
            <div />
            <ul className="font-mono text-[11.5px] text-[var(--text-secondary)] space-y-0.5 max-h-48 overflow-y-auto rail-scroll border-l border-[var(--border)] pl-3">
              {stats.filesTouched.map((f) => (
                <li key={f} className="truncate">
                  {f}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Review changes row */}
      {startSha && (
        <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="eyebrow pt-[3px]">Changes</div>
            <div className="text-[13px] text-[var(--text-primary)]">
              {stats ? (
                <>
                  <span className="tabular-nums font-semibold">{stats.filesTouched.length}</span>
                  <span className="text-[var(--text-secondary)]">
                    {" "}file{stats.filesTouched.length !== 1 ? "s" : ""}
                  </span>
                </>
              ) : (
                <span className="text-[var(--text-muted)]">…</span>
              )}
            </div>
          </div>
          {onReviewChanges && (
            <button
              onClick={onReviewChanges}
              className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] border border-[var(--accent)]/30 rounded px-2 py-0.5"
            >
              Review changes ↗
            </button>
          )}
        </div>
      )}

      {/* Footer: model */}
      <footer className="px-4 py-2 border-t border-[var(--border)] flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-muted)] font-mono">{model}</span>
        <span className="eyebrow text-[var(--text-muted)]">end of log</span>
      </footer>
    </section>
    </div>
  );
}
