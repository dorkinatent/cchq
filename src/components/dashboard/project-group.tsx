"use client";

import { useState } from "react";
import type { OverviewSession } from "@/app/api/sessions/overview/route";
import { compareSessions } from "./phase-label";
import { SessionRow } from "./session-row";

export function ProjectGroup({
  projectId,
  projectName,
  sessions,
  queueCounts,
  expanded,
  onToggleExpanded,
  onRefresh,
  defaultCollapsed = false,
  selected,
  onToggleSelect,
  selectionFull,
}: {
  projectId: string;
  projectName: string;
  sessions: OverviewSession[];
  queueCounts: Record<string, number>;
  expanded: Set<string>;
  onToggleExpanded: (id: string) => void;
  onRefresh: () => void;
  defaultCollapsed?: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  selectionFull: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const sorted = [...sessions].sort(compareSessions);

  const needsAttention = sessions.some(
    (s) => s.blockedInfo != null || s.status === "errored"
  );

  const listId = `project-${projectId}-sessions`;

  return (
    <section>
      <header className="sticky top-0 z-[1] flex items-center px-6 h-8 bg-[var(--bg)]/95 backdrop-blur-sm border-b border-[var(--border)]/70 select-none">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls={listId}
          className="flex items-center gap-2 text-left cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0 rounded"
        >
          <span
            aria-hidden
            className={
              "text-[var(--text-muted)] text-xs transition-transform " +
              (collapsed ? "" : "rotate-90")
            }
          >
            ›
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {projectName}
          </h3>
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {sessions.length}
          </span>
          {needsAttention && (
            <span className="ml-1 w-1 h-1 rounded-full bg-[var(--errored-text)] thinking-dot" />
          )}
        </button>
      </header>
      {!collapsed && (
        <div id={listId} className="px-6 py-0.5">
          <div className="rounded-md border border-[var(--border)]/60 bg-[var(--surface-raised)]/60 overflow-hidden">
            {sorted.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                queuedCount={queueCounts[s.id] ?? 0}
                expanded={expanded.has(s.id)}
                onToggle={() => onToggleExpanded(s.id)}
                onRefresh={onRefresh}
                selected={selected.has(s.id)}
                onToggleSelect={() => onToggleSelect(s.id)}
                selectDisabled={selectionFull}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
