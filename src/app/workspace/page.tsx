"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSessionOverview } from "@/hooks/use-session-overview";
import { SessionColumn } from "@/components/workspace/session-column";
import { WorkspaceTopbar } from "@/components/workspace/workspace-topbar";
import { compareSessions } from "@/components/dashboard/phase-label";
import { useSessionSwitcherActions } from "@/components/session-switcher/context";

const MAX_COLUMNS = 6;

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // De-duplicate while preserving order, cap at MAX_COLUMNS.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_COLUMNS) break;
  }
  return out;
}

function WorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idsRaw = searchParams.get("ids");
  const ids = useMemo(() => parseIds(idsRaw), [idsRaw]);
  const { sessions } = useSessionOverview();
  const { refetchWorkspaces } = useSessionSwitcherActions();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Keep focused column valid. Default to first on mount / after removal.
  useEffect(() => {
    if (ids.length === 0) {
      setFocusedId(null);
      return;
    }
    if (!focusedId || !ids.includes(focusedId)) {
      setFocusedId(ids[0]);
    }
  }, [ids, focusedId]);

  const replaceIds = useCallback(
    (next: string[]) => {
      if (next.length === 0) {
        router.replace("/workspace");
      } else {
        router.replace(`/workspace?ids=${next.join(",")}`);
      }
    },
    [router]
  );

  const addId = useCallback(
    (id: string) => {
      if (ids.includes(id) || ids.length >= MAX_COLUMNS) return;
      replaceIds([...ids, id]);
    },
    [ids, replaceIds]
  );

  const removeId = useCallback(
    (id: string) => {
      replaceIds(ids.filter((x) => x !== id));
    },
    [ids, replaceIds]
  );

  // Cmd+1..6 jumps focus to column N. Skips when a text input has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key < "1" || e.key > "6") return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const idx = Number(e.key) - 1;
      if (idx >= ids.length) return;
      e.preventDefault();
      setFocusedId(ids[idx]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids]);

  const openSessions = useMemo(
    () =>
      ids.map((id) => {
        const s = sessions.find((x) => x.id === id);
        return {
          id,
          name: s?.name ?? id.slice(0, 8),
          projectName: s?.project_name ?? null,
        };
      }),
    [ids, sessions]
  );

  const available = useMemo(
    () =>
      [...sessions]
        .filter((s) => !ids.includes(s.id))
        .sort(compareSessions),
    [sessions, ids]
  );

  if (ids.length === 0) {
    return <EmptyPicker sessions={sessions} onOpen={replaceIds} />;
  }

  // On 1-2 columns, let them flex to fill width. At 3+, lock to 480px each.
  const flexGrow = ids.length <= 2;

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTopbar
        openSessions={openSessions}
        available={available}
        onAdd={addId}
        atLimit={ids.length >= MAX_COLUMNS}
        sessionIds={ids}
        onSaved={refetchWorkspaces}
      />
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className={`flex gap-4 h-full p-4 ${flexGrow ? "w-full" : "min-w-max"}`}>
          {ids.map((id) => (
            <SessionColumn
              key={id}
              sessionId={id}
              focused={focusedId === id}
              onFocus={() => setFocusedId(id)}
              onClose={() => removeId(id)}
              flexGrow={flexGrow}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyPicker({
  sessions,
  onOpen,
}: {
  sessions: ReturnType<typeof useSessionOverview>["sessions"];
  onOpen: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const sorted = useMemo(() => [...sessions].sort(compareSessions), [sessions]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COLUMNS) next.add(id);
      return next;
    });
  }

  const count = picked.size;
  const atLimit = count >= MAX_COLUMNS;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)]">
        <span className="eyebrow text-[var(--text-muted)]">Workspace</span>
        <Link
          href="/"
          className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          ← Back to dashboard
        </Link>
      </header>
      <div className="flex-1 overflow-y-auto flex items-start justify-center pt-16 px-6">
        <div className="w-full max-w-lg">
          <div className="eyebrow text-[var(--text-muted)] mb-2">
            Pick sessions
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
            Open side-by-side
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Select 1–{MAX_COLUMNS} sessions to view as tiled columns.
          </p>
          {sorted.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)] italic">
              No sessions yet.
            </div>
          ) : (
            <ul className="rounded-md border border-[var(--border)] divide-y divide-[var(--border)]/60 bg-[var(--surface)]">
              {sorted.map((s) => {
                const checked = picked.has(s.id);
                const disabled = !checked && atLimit;
                return (
                  <li key={s.id}>
                    <label
                      className={
                        "flex items-center gap-3 px-3 py-2 cursor-pointer " +
                        (disabled
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-[var(--surface-raised)]")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(s.id)}
                        className="accent-[var(--accent)]"
                      />
                      <span className="text-sm text-[var(--text-primary)] truncate max-w-[24ch]">
                        {s.name}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] truncate flex-1">
                        {s.project_name ?? "—"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-6 flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">
              {count} of {MAX_COLUMNS} selected
            </span>
            <button
              disabled={count === 0}
              onClick={() => onOpen([...picked])}
              className="px-4 py-1.5 rounded-md bg-[var(--accent)] text-[var(--bg)] font-semibold text-sm hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Open {count > 0 ? `${count} session${count === 1 ? "" : "s"}` : "sessions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="text-[var(--text-secondary)] text-sm p-6">Loading…</div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
