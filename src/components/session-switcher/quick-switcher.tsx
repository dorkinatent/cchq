"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { relativeTime } from "@/lib/relative-time";
import { useSessionSwitcher, type EnrichedSession } from "./context";

type Row =
  | { kind: "header"; label: string; hint?: string }
  | { kind: "session"; session: EnrichedSession; pinIndex?: number };

function scoreSession(s: EnrichedSession, q: string): number {
  if (!q) return 0;
  const name = s.name.toLowerCase();
  const project = (s.project_name ?? "").toLowerCase();
  const preview = (s.last_message ?? "").toLowerCase();
  const query = q.toLowerCase();

  if (name === query) return 1000;
  if (name.startsWith(query)) return 800;
  if (name.includes(query)) return 600;
  if (project.startsWith(query)) return 400;
  if (project.includes(query)) return 300;
  if (preview.includes(query)) return 100;
  // Light fuzzy: all chars in order
  let i = 0;
  for (const c of name) {
    if (c === query[i]) i++;
    if (i === query.length) return 50;
  }
  return -1;
}

function DotInline({ state }: { state: EnrichedSession["state"] }) {
  const color =
    state === "blocked" || state === "paused"
      ? "var(--paused-text)"
      : state === "errored"
        ? "var(--errored-text)"
        : state === "completed"
          ? "var(--text-muted)"
          : "var(--active-text)";
  const animClass = state === "blocked" ? "rail-dot-blocked" : state === "streaming" ? "rail-dot-streaming" : "";
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${animClass}`}
      style={{
        width: 6,
        height: 6,
        background: state === "completed" ? "transparent" : color,
        border: state === "completed" ? `1px solid ${color}` : "none",
        opacity: state === "idle" ? 0.6 : 1,
      }}
    />
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-[var(--accent)] underline underline-offset-2 decoration-[var(--accent)]/60">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function QuickSwitcher() {
  const { switcherOpen, closeSwitcher, sessions, prefs, navigateTo } = useSessionSwitcher();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Reset on open
  useEffect(() => {
    if (switcherOpen) {
      setQuery("");
      setCursor(0);
      // Focus input on next frame (after animation start)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [switcherOpen]);

  // Build flat list of rows (with headers)
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const pinIndex = (id: string) => {
      const i = prefs.pinned.indexOf(id);
      return i >= 0 ? i : undefined;
    };

    if (query.trim().length > 0) {
      const q = query.trim();
      const matches = sessions
        .map((s) => ({ s, score: scoreSession(s, q) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);
      if (matches.length) out.push({ kind: "header", label: "Matches", hint: `${matches.length}` });
      for (const { s } of matches) out.push({ kind: "session", session: s, pinIndex: pinIndex(s.id) });
      return out;
    }

    const needsYou = sessions.filter((s) => s.state === "blocked");
    if (needsYou.length) {
      out.push({ kind: "header", label: "Needs You", hint: `${needsYou.length}` });
      for (const s of needsYou) out.push({ kind: "session", session: s, pinIndex: pinIndex(s.id) });
    }

    const pinnedSessions = prefs.pinned
      .map((id) => sessions.find((s) => s.id === id))
      .filter((s): s is EnrichedSession => !!s);
    if (pinnedSessions.length) {
      out.push({ kind: "header", label: "Pinned", hint: "⌥1..9" });
      for (let i = 0; i < pinnedSessions.length; i++) {
        out.push({ kind: "session", session: pinnedSessions[i], pinIndex: i });
      }
    }

    const recentIds = prefs.recent.filter(
      (id) => !needsYou.some((n) => n.id === id) && !prefs.pinned.includes(id)
    );
    const recentSessions = recentIds
      .map((id) => sessions.find((s) => s.id === id))
      .filter((s): s is EnrichedSession => !!s)
      .slice(0, 8);
    if (recentSessions.length) {
      out.push({ kind: "header", label: "Recent" });
      for (const s of recentSessions) out.push({ kind: "session", session: s, pinIndex: pinIndex(s.id) });
    }

    // Fallback: just show first ~15 if we have nothing else.
    if (out.length === 0 && sessions.length) {
      out.push({ kind: "header", label: "Sessions" });
      for (const s of sessions.slice(0, 15)) out.push({ kind: "session", session: s, pinIndex: pinIndex(s.id) });
    }
    return out;
  }, [sessions, query, prefs.pinned, prefs.recent]);

  const sessionIndexes = useMemo(() => rows.map((r, i) => (r.kind === "session" ? i : -1)).filter((i) => i >= 0), [rows]);
  const sessionCount = sessionIndexes.length;
  const activeRowIdx = sessionIndexes[Math.min(cursor, sessionCount - 1)] ?? -1;

  // Keyboard
  useEffect(() => {
    if (!switcherOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSwitcher();
        return;
      }
      const nav = e.ctrlKey && (e.key === "j" || e.key === "k");
      if (e.key === "ArrowDown" || nav && e.key === "j") {
        e.preventDefault();
        setCursor((c) => Math.min(sessionCount - 1, c + 1));
        return;
      }
      if (e.key === "ArrowUp" || nav && e.key === "k") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const row = rows[activeRowIdx];
        if (row && row.kind === "session") navigateTo(row.session.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switcherOpen, closeSwitcher, rows, activeRowIdx, sessionCount, navigateTo]);

  // Keep cursor in range
  useEffect(() => {
    if (cursor >= sessionCount) setCursor(Math.max(0, sessionCount - 1));
  }, [cursor, sessionCount]);

  // Scroll active into view
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-idx="${activeRowIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeRowIdx]);

  if (!mounted || !switcherOpen) return null;

  const overlay = (
    <div className="fixed inset-0 z-[60] flex items-start justify-center" role="dialog" aria-modal="true">
      <div
        className="switcher-backdrop-anim backdrop-themed absolute inset-0"
        onClick={closeSwitcher}
      />
      <div
        className="switcher-overlay-anim relative mt-[15vh] w-[min(560px,92vw)] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <span className="text-[var(--text-muted)] text-[13px]">›</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Jump to a session…"
            className="flex-1 bg-transparent outline-none text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <kbd className="text-[10px] tabular-nums text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[56vh] overflow-y-auto rail-scroll py-1">
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--text-secondary)]">
              {query ? (
                <>
                  No match for <span className="text-[var(--text-primary)]">{query}</span>
                </>
              ) : (
                "Type to search, or open a session from the rail."
              )}
            </div>
          )}
          {rows.map((row, i) => {
            if (row.kind === "header") {
              return (
                <div
                  key={`h-${i}`}
                  className="flex items-center px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
                >
                  <span>{row.label}</span>
                  {row.hint && <span className="ml-auto tabular-nums text-[var(--text-muted)]/80">{row.hint}</span>}
                </div>
              );
            }
            const active = i === activeRowIdx;
            const s = row.session;
            const preview =
              s.state === "blocked" && s.blockedTool
                ? `wants to use ${s.blockedTool}${s.blockedPreview ? ` · ${s.blockedPreview}` : ""}`
                : s.last_message;
            return (
              <button
                key={s.id}
                data-row-idx={i}
                onClick={() => navigateTo(s.id)}
                onMouseMove={() => {
                  const sIdx = sessionIndexes.indexOf(i);
                  if (sIdx >= 0 && sIdx !== cursor) setCursor(sIdx);
                }}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 ${
                  active ? "bg-[var(--surface-raised)]" : ""
                }`}
              >
                <DotInline state={s.state} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] text-[var(--text-primary)] truncate">
                      <Highlight text={s.name} query={query} />
                    </span>
                    {s.project_name && (
                      <span className="text-[11px] text-[var(--text-muted)] truncate">
                        · <Highlight text={s.project_name} query={query} />
                      </span>
                    )}
                    <span className="ml-auto text-[10px] tabular-nums text-[var(--text-muted)] shrink-0">
                      {relativeTime(s.updated_at)}
                    </span>
                  </div>
                  {preview && (
                    <div
                      className={`text-[11.5px] truncate mt-0.5 ${
                        s.state === "blocked" ? "text-[var(--paused-text)]" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {preview}
                    </div>
                  )}
                </div>
                {row.pinIndex !== undefined && (
                  <kbd className="text-[10px] tabular-nums text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5 shrink-0">
                    ⌥{row.pinIndex + 1}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> open
          </span>
          <span>
            <kbd className="font-mono">⌥1..9</kbd> pinned
          </span>
          <span className="ml-auto">
            <kbd className="font-mono">⌘⇧[ ]</kbd> cycle
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
