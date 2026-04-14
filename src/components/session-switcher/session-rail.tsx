"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { relativeTime } from "@/lib/relative-time";
import { useSessionSwitcher, useSessionSwitcherActions, type EnrichedSession } from "./context";
import type { RailFilter } from "@/hooks/use-rail-prefs";
import type { Workspace } from "@/hooks/use-workspaces";

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

function RailDropdown({
  items,
  onClose,
}: {
  items: { label: string; danger?: boolean; onClick: () => void }[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-7 z-20 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md shadow-lg py-1 min-w-[140px]">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              item.onClick();
            }}
            className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface)] ${
              item.danger ? "text-[var(--errored-text)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

function SessionRow({ session, current, pinIndex }: { session: EnrichedSession; current: boolean; pinIndex?: number }) {
  const { togglePin } = useSessionSwitcherActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isBlocked = session.state === "blocked";
  const isErrored = session.state === "errored";
  const isPinned = pinIndex !== undefined;

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

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    setMenuOpen(false);
    setConfirmDelete(false);
  }

  return (
    <div className="group relative">
      <Link
        href={`/sessions/${session.id}`}
        className={`relative block rounded-md pl-2 pr-2 py-1.5 transition-colors duration-75 focus-ring ${tint}`}
        title={session.name}
      >
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
      {/* Hover-only ··· menu */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen(!menuOpen);
          setConfirmDelete(false);
        }}
        className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded bg-[var(--surface)] focus-ring"
      >
        ···
      </button>
      {menuOpen && (
        <RailDropdown
          onClose={() => { setMenuOpen(false); setConfirmDelete(false); }}
          items={[
            {
              label: isPinned ? `Unpin (⌥${pinIndex! + 1})` : "Pin session",
              onClick: () => { togglePin(session.id); setMenuOpen(false); },
            },
            {
              label: confirmDelete ? "Click again to delete" : "Delete session",
              danger: true,
              onClick: handleDelete,
            },
          ]}
        />
      )}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDeleteProject() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setMenuOpen(false);
    setConfirmDelete(false);
    // The realtime listener on the context provider will refresh projects.
  }

  if (sessions.length === 0) return null;
  return (
    <div className="mb-3 group/project relative">
      <div className="flex items-center">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded focus-ring min-w-0"
        >
          <span className="inline-block w-2 text-center shrink-0">{collapsed ? "›" : "⌄"}</span>
          <span className="truncate">{projectName}</span>
          <span className="ml-auto text-[var(--text-muted)] tabular-nums shrink-0 group-hover/project:opacity-0 transition-opacity">{sessions.length}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
            setConfirmDelete(false);
          }}
          className="opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1 py-0.5 rounded focus-ring shrink-0"
        >
          ···
        </button>
      </div>
      {menuOpen && (
        <RailDropdown
          onClose={() => { setMenuOpen(false); setConfirmDelete(false); }}
          items={[
            {
              label: "Permissions",
              onClick: () => {
                setMenuOpen(false);
                window.location.href = `/projects/${projectId}/settings`;
              },
            },
            {
              label: confirmDelete
                ? `Delete ${sessions.length} session${sessions.length !== 1 ? "s" : ""} + project?`
                : "Delete project",
              danger: true,
              onClick: handleDeleteProject,
            },
          ]}
        />
      )}
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

function WorkspaceRow({
  workspace,
  onDeleted,
}: {
  workspace: Workspace;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = workspace.sessionIds.length;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/workspaces/${workspace.id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const href = `/workspace?ids=${workspace.sessionIds.join(",")}`;

  return (
    <div className="group relative">
      <Link
        href={href}
        onMouseLeave={() => setConfirming(false)}
        className="relative block rounded-md pl-2 pr-2 py-1.5 transition-colors duration-75 focus-ring hover:bg-[color-mix(in_oklch,var(--surface-raised)_60%,transparent)]"
        title={workspace.name}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-block rounded-sm border border-[var(--text-muted)] shrink-0"
            style={{ width: 7, height: 7 }}
          />
          <span className="truncate text-[13px] leading-tight text-[var(--text-primary)]">
            {workspace.name}
          </span>
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[var(--text-muted)] group-hover:opacity-0 transition-opacity">
            {count} session{count === 1 ? "" : "s"}
          </span>
        </div>
      </Link>
      <button
        onClick={handleDelete}
        onMouseLeave={() => setConfirming(false)}
        disabled={busy}
        className={`absolute right-2 top-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded bg-[var(--surface)] focus-ring ${
          confirming
            ? "text-[var(--errored-text)] opacity-100"
            : "text-[var(--text-muted)] hover:text-[var(--errored-text)]"
        }`}
        title={confirming ? "Click again to confirm" : "Delete workspace"}
      >
        {confirming ? "Delete?" : "×"}
      </button>
    </div>
  );
}

function WorkspacesSection({
  workspaces,
  collapsed,
  onToggle,
  onChanged,
}: {
  workspaces: Workspace[];
  collapsed: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  if (workspaces.length === 0) return null;
  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded focus-ring"
      >
        <span className="inline-block w-2 text-center">{collapsed ? "›" : "⌄"}</span>
        <span className="truncate">Workspaces</span>
        <span className="ml-auto text-[var(--text-muted)] tabular-nums">{workspaces.length}</span>
      </button>
      {!collapsed && (
        <div className="space-y-px mt-0.5">
          {workspaces.map((w) => (
            <WorkspaceRow key={w.id} workspace={w} onDeleted={onChanged} />
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
    workspaces,
    refetchWorkspaces,
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
        // Only sessions with pending permission prompts — errored sessions
        // have no actionable UI, so they don't belong here.
        return sessions.filter((s) => s.state === "blocked");
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
            className="font-display text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] leading-none rounded focus-ring"
          >
            CCUI
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              onClick={openSwitcher}
              className="font-mono text-[10px] tabular-nums text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)] rounded px-1.5 py-0.5 focus-ring"
              title="Quick switcher (⌘K)"
            >
              ⌘K
            </button>
            <button
              onClick={openNewSession}
              className="font-mono text-[11px] leading-none text-[var(--bg)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded w-5 h-5 flex items-center justify-center transition-colors focus-ring"
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
              className="ml-auto text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded bg-[var(--paused-bg)] text-[var(--paused-text)] hover:brightness-110 focus-ring"
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
              className={`text-[10px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-full transition-colors focus-ring ${
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
              className="block mt-2 text-[var(--accent)] hover:text-[var(--accent-hover)] rounded focus-ring"
            >
              Show all sessions
            </button>
          </div>
        )}
        <WorkspacesSection
          workspaces={workspaces}
          collapsed={!!prefs.collapsedGroups["__workspaces__"]}
          onToggle={() => toggleGroup("__workspaces__")}
          onChanged={refetchWorkspaces}
        />
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
              className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded focus-ring"
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
          className={`block px-2 py-1.5 rounded text-[12px] focus-ring ${
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
