"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionSwitcher, useSessionSwitcherActions } from "./context";
import { relativeTime } from "@/lib/relative-time";
import { CarouselPositionCounter } from "@/components/chat/mobile-carousel";

/**
 * Mobile-only top bar with hamburger, title, and new-session button.
 * Visible below the `md` breakpoint where the desktop rail is hidden.
 */
export function MobileHeader() {
  const { blockedCount } = useSessionSwitcher();
  const { openMobileRail, openNewSession } = useSessionSwitcherActions();

  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={openMobileRail}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 -ml-1"
          aria-label="Open navigation"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="3" y1="5" x2="17" y2="5" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="15" x2="17" y2="15" />
          </svg>
        </button>
        <span
          className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]"
          style={{ fontVariationSettings: '"CASL" 0.6, "MONO" 0, "slnt" 0' }}
        >
          CCUI
        </span>
        {blockedCount > 0 && (
          <span className="text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded bg-[var(--paused-bg)] text-[var(--paused-text)]">
            {blockedCount}
          </span>
        )}
        <CarouselPositionCounter />
      </div>
      <button
        onClick={openNewSession}
        className="text-[11px] leading-none text-[var(--bg)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded w-7 h-7 flex items-center justify-center transition-colors"
        aria-label="New session"
      >
        +
      </button>
    </header>
  );
}

/**
 * Full-screen overlay that slides the SessionRail in from the left.
 * Only renders on mobile (uses a portal so it sits above everything).
 */
export function MobileRailOverlay() {
  const { mobileRailOpen } = useSessionSwitcher();
  const { closeMobileRail } = useSessionSwitcherActions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Lock body scroll while open.
  useEffect(() => {
    if (!mobileRailOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileRailOpen]);

  if (!mounted || !mobileRailOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-themed"
        onClick={closeMobileRail}
        aria-hidden
      />
      {/* Rail container — slides in from left */}
      <div
        className="absolute top-0 left-0 bottom-0 w-[280px] max-w-[85vw] bg-[var(--surface)] border-r border-[var(--border)] shadow-2xl flex flex-col"
        style={{ animation: "mobile-rail-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both" }}
      >
        {/* Close button at top */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <span
            className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]"
            style={{ fontVariationSettings: '"CASL" 0.6, "MONO" 0, "slnt" 0' }}
          >
            CCUI
          </span>
          <button
            onClick={closeMobileRail}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>
        {/* Render the actual rail content inline — reuse the scroll area
            from SessionRail but in a mobile-friendly wrapper. We import
            SessionRail and let it render naturally; its `hidden md:flex`
            class is on the outer aside, but here we're in a portal so
            the rail's own visibility class doesn't apply. We need to
            render the rail's INNER content directly.

            Simpler approach: just render SessionRail and override its
            visibility via a wrapper. */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <MobileRailContent />
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Renders the session rail content for mobile — filter chips, session list,
 * footer. This is a slimmed version that reuses the same data/hooks but
 * renders without the desktop aside wrapper.
 */
function MobileRailContent() {
  const {
    projects,
    sessions,
    blockedCount,
    prefs,
    currentSessionId,
  } = useSessionSwitcher();
  const {
    setFilter,
    openNewSession,
    closeMobileRail,
  } = useSessionSwitcherActions();

  const pathname = usePathname();

  type RailFilter = typeof prefs.filter;
  const FILTERS: { id: RailFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "paused", label: "Paused" },
    { id: "needs-you", label: "Needs You" },
    { id: "recent", label: "Recent" },
  ];

  // Simple flat session list for mobile — no project grouping, just sorted by recency.
  const sorted = useMemo(() => {
    switch (prefs.filter) {
      case "active":
        return sessions.filter((s: any) => s.state === "streaming" || s.state === "idle" || s.state === "blocked");
      case "paused":
        return sessions.filter((s: any) => s.state === "paused");
      case "needs-you":
        return sessions.filter((s: any) => s.state === "blocked");
      case "recent": {
        const order = new Map(prefs.recent.map((id: string, i: number) => [id, i]));
        return [...sessions]
          .filter((s: any) => order.has(s.id))
          .sort((a: any, b: any) => (order.get(a.id)! - order.get(b.id)!));
      }
      default:
        return sessions;
    }
  }, [sessions, prefs.filter, prefs.recent]);

  const dotColor = (state: string) => {
    if (state === "blocked") return "bg-[var(--paused-text)] rail-dot-blocked";
    if (state === "errored") return "bg-[var(--errored-text)]";
    if (state === "streaming") return "bg-[var(--active-text)] rail-dot-streaming";
    if (state === "idle") return "bg-[var(--active-text)] opacity-60";
    if (state === "paused") return "bg-[var(--text-muted)]";
    return "border border-[var(--text-muted)]";
  };

  return (
    <>
      {/* Filter chips */}
      <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-[var(--border)]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-[11px] uppercase tracking-[0.08em] px-2.5 py-1.5 rounded-full transition-colors ${
              prefs.filter === f.id
                ? "bg-[var(--accent)] text-[var(--bg)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
            }`}
          >
            {f.label}
            {f.id === "needs-you" && blockedCount > 0 && prefs.filter !== f.id && (
              <span className="ml-1 text-[var(--paused-text)] tabular-nums">{blockedCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto rail-scroll px-3 py-2">
        {sorted.length === 0 && (
          <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">
            {sessions.length === 0 ? "No sessions yet" : "No matches"}
          </div>
        )}
        {sorted.map((s: any) => (
          <Link
            key={s.id}
            href={`/sessions/${s.id}`}
            onClick={closeMobileRail}
            className={`block rounded-md px-3 py-2.5 mb-1 transition-colors ${
              s.id === currentSessionId
                ? "bg-[var(--surface-raised)]"
                : "hover:bg-[color-mix(in_oklch,var(--surface-raised)_60%,transparent)]"
            } ${s.state === "blocked" ? "bg-[color-mix(in_oklch,var(--paused-bg)_60%,transparent)]" : ""}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`inline-block rounded-full shrink-0 ${dotColor(s.state)}`} style={{ width: 6, height: 6 }} />
              <span className={`truncate text-[14px] ${
                s.state === "paused" ? "italic text-[var(--text-secondary)]" : "text-[var(--text-primary)]"
              } ${s.state === "completed" ? "opacity-60" : ""}`}>
                {s.name}
              </span>
              <span className="ml-auto text-[11px] tabular-nums text-[var(--text-muted)] shrink-0">
                {relativeTime(s.updated_at)}
              </span>
            </div>
            {s.project_name && (
              <div className="mt-0.5 pl-[18px] text-[12px] text-[var(--text-muted)] truncate">
                {s.project_name}
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] px-3 py-2 flex flex-col gap-1">
        <Link
          href="/knowledge"
          onClick={closeMobileRail}
          className={`block px-2 py-1.5 rounded text-[13px] ${
            pathname === "/knowledge"
              ? "bg-[var(--surface-raised)] text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Knowledge
        </Link>
        <button
          onClick={() => { closeMobileRail(); openNewSession(); }}
          className="w-full text-left px-2 py-1.5 rounded text-[13px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          + New session
        </button>
      </div>
    </>
  );
}
