"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSessions } from "@/hooks/use-sessions";
import { SessionCard } from "@/components/session-card";
import { useSessionSwitcher } from "@/components/session-switcher/context";

function DashboardContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") || undefined;
  const { sessions, loading } = useSessions(projectId);
  const { openNewSession } = useSessionSwitcher();
  const [search, setSearch] = useState("");

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
      <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border)]">
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
            className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] w-52 placeholder-[var(--text-muted)]"
          />
          <button
            onClick={openNewSession}
            className="bg-[var(--accent)] text-[var(--bg)] px-3.5 py-1.5 rounded-md text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
          >
            + New session
          </button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-[var(--text-secondary)] text-sm">Loading sessions...</div>
        ) : filtered.length === 0 ? (
          <div className="py-24 max-w-sm mx-auto text-center">
            <div className="eyebrow text-[var(--text-muted)] mb-3">Nothing in flight</div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Press{" "}
              <kbd className="font-mono text-[11px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-muted)]">⌥⇧N</kbd>{" "}
              to start one, or{" "}
              <kbd className="font-mono text-[11px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-muted)]">⌘K</kbd>{" "}
              to jump to a recent one.
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
