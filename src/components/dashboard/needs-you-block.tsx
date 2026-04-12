"use client";

import Link from "next/link";
import type { OverviewSession } from "@/app/api/sessions/overview/route";
import { relativeTime } from "@/lib/relative-time";

export function NeedsYouBlock({ sessions }: { sessions: OverviewSession[] }) {
  const blocked = sessions.filter((s) => s.blockedInfo != null);
  if (blocked.length === 0) return null;

  return (
    <section className="px-6 pt-5">
      <header className="flex items-baseline justify-between mb-2">
        <h2 className="eyebrow text-[var(--errored-text)]">
          Needs you · {blocked.length}
        </h2>
        <span className="text-xs text-[var(--text-muted)]">
          Permission requests waiting on your call
        </span>
      </header>
      <ul className="rounded-md overflow-hidden border border-[var(--errored-border)]/60 bg-[var(--paused-bg)]/40">
        {blocked.map((s, i) => (
          <li
            key={s.id}
            className={
              "flex items-center gap-3 px-3 h-10 text-sm " +
              (i > 0 ? "border-t border-[var(--border)]/60" : "")
            }
          >
            <span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full bg-[var(--errored-text)] shrink-0"
            />
            <span className="text-[var(--text-primary)] font-medium truncate max-w-[22ch]">
              {s.name}
            </span>
            <span className="text-[var(--text-muted)] text-xs truncate max-w-[22ch]">
              {s.project_name ?? "—"}
            </span>
            <span className="text-[var(--text-secondary)] text-xs font-mono truncate flex-1">
              {s.blockedInfo!.toolName}
              {s.blockedInfo!.preview ? `: ${s.blockedInfo!.preview}` : ""}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
              {relativeTime(s.updatedAt)}
            </span>
            <Link
              href={`/sessions/${s.id}`}
              className="ml-2 px-2 py-0.5 rounded bg-[var(--accent)] text-[var(--bg)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors"
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
