"use client";

import type { OverviewSession } from "@/app/api/sessions/overview/route";

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

  const stats: Stat[] = [
    { label: "Active", value: String(activeCount) },
    { label: "Streaming", value: String(streamingCount), tone: streamingCount > 0 ? "accent" : "default" },
    {
      label: "Needs you",
      value: String(needsYouCount),
      tone: needsYouCount > 0 ? "attention" : "default",
    },
    { label: "Tokens today", value: formatTokens(tokensToday) },
    { label: "Cost today", value: `$${costToday.toFixed(2)}` },
  ];

  return (
    <div className="flex items-center justify-between gap-6 px-6 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
      <DefRow stats={stats} />
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search sessions…"
          className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] w-52 placeholder-[var(--text-muted)]"
        />
        <button
          onClick={onNew}
          className="bg-[var(--accent)] text-[var(--bg)] px-3.5 py-1.5 rounded-md text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
        >
          + New session
        </button>
      </div>
    </div>
  );
}
