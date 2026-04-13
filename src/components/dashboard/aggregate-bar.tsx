"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OverviewSession } from "@/app/api/sessions/overview/route";
import { useSessionSwitcher } from "@/components/session-switcher/context";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function startOfLocalDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

type Stat = {
  label: string;
  value: string;
  tone?: "default" | "accent" | "attention";
};

function DefRow({ stats }: { stats: Stat[] }) {
  return (
    <dl className="flex items-center gap-6">
      {stats.map((s) => (
        <div key={s.label} className="flex items-baseline gap-2 whitespace-nowrap">
          <dt className="eyebrow text-[var(--text-muted)]">{s.label}</dt>
          <dd
            className={
              "text-sm font-medium tabular-nums " +
              (s.tone === "attention"
                ? "text-[var(--errored-text)]"
                : s.tone === "accent"
                ? "text-[var(--accent)]"
                : "text-[var(--text-primary)]")
            }
          >
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AggregateBar({
  sessions,
  search,
  onSearch,
  onNew,
}: {
  sessions: OverviewSession[];
  search: string;
  onSearch: (s: string) => void;
  onNew: () => void;
}) {
  const activeCount = sessions.filter((s) => s.status === "active").length;
  const streamingCount = sessions.filter(
    (s) => s.liveState?.hasActiveQuery === true
  ).length;
  const needsYouCount = sessions.filter((s) => s.blockedInfo != null).length;

  const todayStart = startOfLocalDay(new Date());
  let tokensToday = 0;
  let costToday = 0;
  for (const s of sessions) {
    const updated = new Date(s.updatedAt).getTime();
    const created = new Date(s.createdAt).getTime();
    if (updated >= todayStart || created >= todayStart) {
      tokensToday += s.usage?.totalTokens ?? 0;
      costToday += s.usage?.totalCostUsd ?? 0;
    }
  }

  const mobileStats: Stat[] = [
    { label: "Active", value: String(activeCount) },
    { label: "Streaming", value: String(streamingCount), tone: streamingCount > 0 ? "accent" : "default" },
    {
      label: "Needs you",
      value: String(needsYouCount),
      tone: needsYouCount > 0 ? "attention" : "default",
    },
  ];
  const stats: Stat[] = [
    ...mobileStats,
    { label: "Tokens today", value: formatTokens(tokensToday) },
    { label: "Cost today", value: `$${costToday.toFixed(2)}` },
  ];

  return (
    <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-3 md:gap-6 px-4 md:px-6 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="min-w-0 md:hidden">
        <DefRow stats={mobileStats} />
      </div>
      <div className="min-w-0 hidden md:block">
        <DefRow stats={stats} />
      </div>
      <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
        <div className="hidden md:block">
          <WorkspacesMenu />
        </div>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search sessions…"
          className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] flex-1 md:flex-none md:w-52 min-w-0 placeholder-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
        />
        <button
          onClick={onNew}
          className="shrink-0 bg-[var(--accent)] text-[var(--bg)] px-3.5 py-1.5 rounded-md text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
        >
          <span className="md:hidden">+ New</span>
          <span className="hidden md:inline">+ New session</span>
        </button>
      </div>
    </div>
  );
}

function WorkspacesMenu() {
  const router = useRouter();
  const { workspaces } = useSessionSwitcher();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (workspaces.length === 0) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
      >
        Workspaces ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 max-h-[60vh] overflow-y-auto z-30 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] shadow-lg py-1">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setOpen(false);
                router.push(`/workspace?ids=${w.sessionIds.join(",")}`);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface)] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              <span className="text-[var(--text-primary)] truncate flex-1">{w.name}</span>
              <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                {w.sessionIds.length}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
