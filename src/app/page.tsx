"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSessions } from "@/hooks/use-sessions";
import { SessionCard } from "@/components/session-card";
import { useSessionSwitcher } from "@/components/session-switcher/context";
import { ThemeSwitcher } from "@/components/theme-switcher";

function DashboardContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") || undefined;
  const { sessions, loading } = useSessions(projectId);
  const { openNewSession } = useSessionSwitcher();
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeSessions = sessions.filter((s) => s.status === "active");

  const filtered = search
    ? sessions.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.project_name?.toLowerCase().includes(search.toLowerCase())
      )
    : sessions;

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center px-4 md:px-6 py-3 md:py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-4">
          <span className="text-[var(--text-secondary)] text-sm">
            {activeSessions.length} active session{activeSessions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] flex-1 md:w-52 md:flex-none placeholder-[var(--text-muted)]"
          />
          <button
            onClick={openNewSession}
            aria-label="New session"
            className="bg-[var(--accent)] text-[var(--bg)] px-3.5 py-2 rounded-md text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors min-h-11 min-w-11 shrink-0"
          >
            + New
          </button>
          <div className="md:hidden relative">
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Menu"
              className="flex items-center justify-center min-h-11 min-w-11 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)]"
            >
              <span className="text-base leading-none font-bold">···</span>
            </button>
            {mobileMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMobileMenuOpen(false)} />
                <div className="absolute top-full right-0 mt-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md shadow-lg z-40 p-3 min-w-[200px]">
                  <ThemeSwitcher />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 md:p-5">
        {loading ? (
          <div className="text-[var(--text-secondary)] text-sm">Loading sessions...</div>
        ) : filtered.length === 0 ? (
          <div className="py-24 max-w-sm mx-auto text-center">
            <div className="eyebrow text-[var(--text-muted)] mb-3">Nothing in flight</div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <span className="hidden md:inline">
                Press{" "}
                <kbd className="font-mono text-[11px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-muted)]">⌥⇧N</kbd>
                {" "}
                to start one, or{" "}
                <kbd className="font-mono text-[11px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-muted)]">⌘K</kbd>
                {" "}
                to jump to a recent one.
              </span>
              <span className="md:hidden">Tap + New to start a session.</span>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="text-[var(--text-secondary)] text-sm p-6">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
