"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { relativeTime } from "@/lib/relative-time";
import { useSessionSwitcher, type EnrichedSession } from "./context";
import type { RailFilter } from "@/hooks/use-rail-prefs";

const FILTERS: { id: RailFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "needs-you", label: "Needs You" },
  { id: "recent", label: "Recent" },
];

function StateDot({ state }: { state: EnrichedSession["state"] }) {
  const base = "inline-block rounded-full shrink-0";
  if (state === "blocked")
    return (
      <span
        className={`${base} rail-dot-blocked bg-[var(--paused-text)] shadow-[0_0_0_2px_color-mix(in_oklch,var(--paused-text)_25%,transparent)]`}
        style={{ width: 7, height: 7 }}
        aria-label="Needs you"
      />
    );
  if (state === "errored")
    return <span className={`${base} bg-[var(--errored-text)]`} style={{ width: 6, height: 6 }} aria-label="Errored" />;
  if (state === "streaming")
    return (
      <span
        className={`${base} rail-dot-streaming bg-[var(--active-text)]`}
        style={{ width: 6, height: 6 }}
        aria-label="Streaming"
      />
    );
  if (state === "idle")
    return <span className={`${base} bg-[var(--active-text)] opacity-60`} style={{ width: 5, height: 5 }} aria-label="Idle" />;
  if (state === "paused")
    return <span className={`${base} bg-[var(--text-muted)]`} style={{ width: 5, height: 5 }} aria-label="Paused" />;
  return (
    <span
      className={`${base} border border-[var(--text-muted)]`}
      style={{ width: 6, height: 6, background: "transparent" }}
      aria-label="Completed"
    />
  );
}

function SessionRow({ session, current, pinIndex }: { session: EnrichedSession; current: boolean; pinIndex?: number }) {
  const { togglePin } = useSessionSwitcher();
  const isBlocked = session.state === "blocked";
  const isErrored = session.state === "errored";
  const isPinned = pinIndex !== undefined;

  // Background tint for attention states (NOT a border stripe — see design brief).
  const tint =
    isBlocked
      ? "bg-[color-mix(in_oklch,var(--paused-bg)_70%,transparent)] hover:bg-[var(--paused-bg)]"
      : isErrored
        ? "bg-[color-mix(in_oklch,var(--errored-bg)_55%,transparent)] hover:bg-[var(--errored-bg)]"
        : current
          ? "bg-[var(--surface-raised)]"
          : "hover:bg-[color-mix(in_oklch,var(--surface-raised)_60%,transparent)]";

  const preview =
    isBlocked && session.blockedTool
      ? `wants to use ${session.blockedTool}${session.blockedPreview ? ` · ${session.blockedPreview}` : ""}`
      : session.last_message;

  return (
    <div className="group relative">
      <Link
        href={`/sessions/${session.id}`}
        className={`relative block rounded-md pl-2 pr-2 py-1.5 transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0 ${tint}`}
        title={session.name}
      >
        {/* Current marker: inset left edge, no stripe */}
        {current && (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-[var(--accent)]"
          />
        )}
        <div className="flex items-center gap-2 min-w-0">
          <StateDot state={session.state} />
          <span
            className={`truncate text-[13px] leading-tight ${
              session.state === "paused" ? "italic text-[var(--text-secondary)]" : "text-[var(--text-primary)]"
            } ${session.state === "completed" ? "opacity-60" : ""}`}
          >
            {session.name}
          </span>
          {/* Trailing meta slot: pin badge (if pinned) OR timestamp. Hover reveals pin/unpin button in its place. */}
          <span className="ml-auto shrink-0 relative flex items-center">
            {isPinned ? (
              <span className="text-[9.5px] font-medium tabular-nums text-[var(--text-muted)] border border-[var(--border)] rounded px-1 py-px leading-none group-hover:opacity-0 transition-opacity">
                ⌥{pinIndex! + 1}
              </span>
            ) : (
              <span className="text-[10px] tabular-nums text-[var(--text-muted)] group-hover:opacity-0 transition-opacity">
                {relativeTime(session.updated_at)}
              </span>
            )}
          </span>
        </div>
        {preview && (
          <div
            className={`mt-0.5 pl-[15px] text-[11.5px] truncate leading-snug ${
              isBlocked ? "text-[var(--paused-text)]" : "text-[var(--text-secondary)]"
            }`}
          >
            {preview}
          </div>
        )}
      </Link>
      {/* Hover-only pin toggle, positioned where the meta was so nothing overlaps. */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          togglePin(session.id);
        }}
        className="absolute right-2 top-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[10px] font-medium tracking-wide uppercase text-[var(--text-muted)] hover:text-[var(--accent)] px-1.5 py-0.5 rounded bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
        title={isPinned ? `Unpin (⌥${pinIndex! + 1})` : "Pin"}
      >
        {isPinned ? "Unpin" : "Pin"}
      </button>
    </div>
  );
}

function ProjectGroup({
  projectName,
  projectId,
  sessions,
  collapsed,
  onToggle,
  currentSessionId,
  pinnedIds,
}: {
  projectName: string;
  projectId: string;
  sessions: EnrichedSession[];
  collapsed: boolean;
  onToggle: () => void;
  currentSessionId: string | null;
  pinnedIds: string[];
}) {
  if (sessions.length === 0) return null;
  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
      >
        <span className="inline-block w-2 text-center">{collapsed ? "›" : "⌄"}</span>
        <span className="truncate">{projectName}</span>
        <span className="ml-auto text-[var(--text-muted)] tabular-nums">{sessions.length}</span>
      </button>
      {!collapsed && (
        <div className="space-y-px mt-0.5">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              current={s.id === currentSessionId}
              pinIndex={pinnedIds.indexOf(s.id) >= 0 ? pinnedIds.indexOf(s.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionRail() {
  const pathname = usePathname();
  const {
    projects,
    sessions,
    blockedCount,
    prefs,
    hydrated,
    setWidth,
    setFilter,
    toggleGroup,
    setCompletedOpen,
    openSwitcher,
    openNewSession,
    currentSessionId,
  } = useSessionSwitcher();

  const asideRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);

  // Filter sessions
  const filtered = useMemo(() => {
    switch (prefs.filter) {
      case "active":
        return sessions.filter((s) => s.state === "streaming" || s.state === "idle" || s.state === "blocked");
      case "paused":
        return sessions.filter((s) => s.state === "paused");
      case "needs-you":
        return sessions.filter((s) => s.state === "blocked" || s.state === "errored");
      case "recent":
        const order = new Map(prefs.recent.map((id, i) => [id, i]));
        return [...sessions]
          .filter((s) => order.has(s.id))
          .sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
      default:
        return sessions;
    }
  }, [sessions, prefs.filter, prefs.recent]);

  // Partition: attention (blocked/errored) float to top as a flat section.
  const attention = useMemo(() => filtered.filter((s) => s.state === "blocked" || s.state === "errored"), [filtered]);
  const completed = useMemo(() => filtered.filter((s) => s.state === "completed"), [filtered]);
  const byProject = useMemo(() => {
    const rest = filtered.filter((s) => s.state !== "blocked" && s.state !== "errored" && s.state !== "completed");
    const map = new Map<string, EnrichedSession[]>();
    for (const s of rest) {
      const arr = map.get(s.project_id) ?? [];
      arr.push(s);
      map.set(s.project_id, arr);
    }
    return map;
  }, [filtered]);

  // Drag-to-resize
  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startW = prefs.width;
    function onMove(ev: MouseEvent) {
      const next = Math.max(200, Math.min(420, startW + (ev.clientX - startX)));
      setWidth(next);
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const width = hydrated ? prefs.width : 240;
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  return (
    <aside
      ref={asideRef}
      className="relative shrink-0 border-r border-[var(--border)] bg-[var(--surface)] hidden md:flex flex-col"
      style={{ width }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] leading-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
          >
            CCUI
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              onClick={openSwitcher}
              className="font-mono text-[10px] tabular-nums text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)] rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
              title="Quick switcher (⌘K)"
            >
              ⌘K
            </button>
            <button
              onClick={openNewSession}
              className="font-mono text-[11px] leading-none text-[var(--bg)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded w-5 h-5 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
              title="New session (⌥⇧N)"
              aria-label="New session"
            >
              +
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="eyebrow">Claude Code</span>
          {blockedCount > 0 && (
            <button
              onClick={() => setFilter("needs-you")}
              className="ml-auto text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded bg-[var(--paused-bg)] text-[var(--paused-text)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              <span className="rail-dot-blocked inline-block w-1.5 h-1.5 rounded-full bg-[var(--paused-text)] mr-1 align-middle" />
              {blockedCount} need you
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-3 pb-2 flex gap-1 flex-wrap">
        {FILTERS.map((f) => {
          const active = prefs.filter === f.id;
          const needsYouChip = f.id === "needs-you";
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-[10px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0 ${
                active
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              {f.label}
              {needsYouChip && blockedCount > 0 && !active && (
                <span className="ml-1 text-[var(--paused-text)] tabular-nums">{blockedCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Scroll area */}
      <div className="flex-1 min-h-0 overflow-y-auto rail-scroll px-3 pb-2">
        {/* Attention section */}
        {attention.length > 0 && (
          <div className="mb-3">
            <div className="px-1 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--paused-text)] flex items-center gap-1.5">
              <span className="rail-dot-blocked inline-block w-1.5 h-1.5 rounded-full bg-[var(--paused-text)]" />
              Needs You
              <span className="ml-auto text-[var(--text-muted)] tabular-nums">{attention.length}</span>
            </div>
            <div className="space-y-px mt-0.5">
              {attention.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  current={s.id === currentSessionId}
                  pinIndex={prefs.pinned.indexOf(s.id) >= 0 ? prefs.pinned.indexOf(s.id) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {projects.length === 0 && sessions.length === 0 && (
          <div className="px-1 py-6 text-[12px] text-[var(--text-secondary)] leading-relaxed">
            No sessions yet.
            <br />
            <span className="text-[var(--text-muted)]">Press ⌘K to search, or open the dashboard to start one.</span>
          </div>
        )}
        {filtered.length === 0 && sessions.length > 0 && (
          <div className="px-1 py-6 text-[12px] text-[var(--text-secondary)] leading-relaxed">
            Nothing matches <span className="text-[var(--text-primary)]">{prefs.filter.replace("-", " ")}</span>.
            <button
              onClick={() => setFilter("all")}
              className="block mt-2 text-[var(--accent)] hover:text-[var(--accent-hover)] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              Show all sessions
            </button>
          </div>
        )}
        {projects.map((p) => {
          const arr = byProject.get(p.id) ?? [];
          if (arr.length === 0) return null;
          return (
            <ProjectGroup
              key={p.id}
              projectId={p.id}
              projectName={p.name}
              sessions={arr}
              collapsed={!!prefs.collapsedGroups[p.id]}
              onToggle={() => toggleGroup(p.id)}
              currentSessionId={currentSessionId}
              pinnedIds={prefs.pinned}
            />
          );
        })}
        {/* Orphan sessions — any project not in the projects list */}
        {Array.from(byProject.entries())
          .filter(([pid]) => !projectsById.has(pid))
          .map(([pid, arr]) => (
            <ProjectGroup
              key={pid}
              projectId={pid}
              projectName={arr[0]?.project_name ?? "Unsorted"}
              sessions={arr}
              collapsed={!!prefs.collapsedGroups[pid]}
              onToggle={() => toggleGroup(pid)}
              currentSessionId={currentSessionId}
              pinnedIds={prefs.pinned}
            />
          ))}

        {/* Completed drawer */}
        {completed.length > 0 && (
          <div className="mt-2 pt-3 border-t border-[var(--border)]">
            <button
              onClick={() => setCompletedOpen(!prefs.completedOpen)}
              className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              <span className="inline-block w-2 text-center">{prefs.completedOpen ? "⌄" : "›"}</span>
              Completed
              <span className="ml-auto tabular-nums">{completed.length}</span>
            </button>
            {prefs.completedOpen && (
              <div className="space-y-px mt-0.5 opacity-80">
                {completed.map((s) => (
                  <SessionRow key={s.id} session={s} current={s.id === currentSessionId} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: knowledge link stacked above theme switcher */}
      <div className="border-t border-[var(--border)] px-3 py-2 flex flex-col gap-1">
        <Link
          href="/knowledge"
          className={`block px-2 py-1.5 rounded text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0 ${
            pathname === "/knowledge"
              ? "bg-[var(--surface-raised)] text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Knowledge
        </Link>
        <ThemeSwitcher />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        className={`absolute top-0 right-0 h-full w-1 cursor-col-resize ${
          dragging ? "bg-[var(--accent)]/40" : "hover:bg-[var(--border)]"
        }`}
        title="Drag to resize"
      />
    </aside>
  );
}
