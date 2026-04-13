"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSessionSwitcherActions } from "@/components/session-switcher/context";
import {
  useSessionOverview,
  useAllQueues,
} from "@/hooks/use-session-overview";
import { AggregateBar } from "@/components/dashboard/aggregate-bar";
import { NeedsYouBlock } from "@/components/dashboard/needs-you-block";
import { ProjectGroup } from "@/components/dashboard/project-group";
import type { OverviewSession } from "@/app/api/sessions/overview/route";

function groupByProject(sessions: OverviewSession[]) {
  const groups = new Map<
    string,
    { projectId: string; projectName: string; sessions: OverviewSession[]; maxUpdated: number }
  >();
  for (const s of sessions) {
    const key = s.projectId;
    const name = s.project_name ?? "Unknown project";
    const bucket = groups.get(key);
    const updated = new Date(s.updatedAt).getTime();
    if (bucket) {
      bucket.sessions.push(s);
      if (updated > bucket.maxUpdated) bucket.maxUpdated = updated;
    } else {
      groups.set(key, {
        projectId: key,
        projectName: name,
        sessions: [s],
        maxUpdated: updated,
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.maxUpdated - a.maxUpdated);
}

const WORKSPACE_MAX = 6;

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project") || undefined;
  const { sessions, loading, refetch } = useSessionOverview();
  const queueCounts = useAllQueues();
  const { openNewSession } = useSessionSwitcherActions();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    let list = sessions;
    if (projectFilter) list = list.filter((s) => s.projectId === projectFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.project_name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [sessions, projectFilter, search]);

  const groups = useMemo(() => groupByProject(visible), [visible]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < WORKSPACE_MAX) next.add(id);
      return next;
    });
  }

  const selectionFull = selected.size >= WORKSPACE_MAX;

  return (
    <div>
      <AggregateBar
        sessions={visible}
        search={search}
        onSearch={setSearch}
        onNew={openNewSession}
      />

      {loading && sessions.length === 0 ? (
        <div className="text-[var(--text-secondary)] text-sm px-6 py-10">
          Loading sessions…
        </div>
      ) : visible.length === 0 ? (
        <div className="py-24 max-w-sm mx-auto text-center">
          <div className="eyebrow text-[var(--text-muted)] mb-3">
            Nothing in flight
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Press{" "}
            <kbd className="font-mono text-[11px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-muted)]">
              ⌥⇧N
            </kbd>{" "}
            to start one, or{" "}
            <kbd className="font-mono text-[11px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-muted)]">
              ⌘K
            </kbd>{" "}
            to jump to a recent one.
          </p>
        </div>
      ) : (
        <>
          <NeedsYouBlock sessions={visible} />
          <div className="pt-5 pb-10 space-y-5">
            {groups.map((g) => (
              <ProjectGroup
                key={g.projectId}
                projectId={g.projectId}
                projectName={g.projectName}
                sessions={g.sessions}
                queueCounts={queueCounts}
                expanded={expanded}
                onToggleExpanded={toggleExpanded}
                onRefresh={refetch}
                selected={selected}
                onToggleSelect={toggleSelected}
                selectionFull={selectionFull}
              />
            ))}
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border)] bg-[var(--surface-raised)]/95 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
            <div className="text-sm text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)] tabular-nums">
                {selected.size}
              </span>{" "}
              session{selected.size === 1 ? "" : "s"} selected
              {selectionFull && (
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  · max {WORKSPACE_MAX}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="px-2.5 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  const ids = [...selected].join(",");
                  setSelected(new Set());
                  router.push(`/workspace?ids=${ids}`);
                }}
                className="px-3.5 py-1.5 rounded-md bg-[var(--accent)] text-[var(--bg)] font-semibold text-sm hover:bg-[var(--accent-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
              >
                Open in workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="text-[var(--text-secondary)] text-sm p-6">Loading…</div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
