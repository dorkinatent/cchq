"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSessions } from "@/hooks/use-sessions";
import { SessionCard } from "@/components/session-card";
import { NewSessionDialog } from "@/components/new-session-dialog";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") || undefined;
  const { sessions, loading } = useSessions(projectId);
  const [dialogOpen, setDialogOpen] = useState(false);
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
      <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <span className="text-neutral-500 text-sm">
            {activeSessions.length} active session{activeSessions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-white w-52 placeholder-neutral-600"
          />
          <button
            onClick={() => setDialogOpen(true)}
            className="bg-blue-600 text-white px-3.5 py-1.5 rounded-md text-sm font-medium hover:bg-blue-500"
          >
            + New Session
          </button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-neutral-500 text-sm">Loading sessions...</div>
        ) : filtered.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-20">
            No sessions yet. Click &ldquo;+ New Session&rdquo; to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      <NewSessionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
