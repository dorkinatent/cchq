"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import type { DaemonStatus as DaemonStatusType } from "@/lib/engines/types";
import { DaemonStatus } from "@/components/rig/daemon-status";
import { AgentTree } from "@/components/rig/agent-tree";
import { ReadyBeads } from "@/components/rig/ready-beads";
import { EventFeed } from "@/components/rig/event-feed";

type Status = {
  daemon: DaemonStatusType;
  rig: { id: string; projectId: string; townPath: string; rigName: string };
};

export default function RigDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [status, setStatus] = useState<Status | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rigs/${id}/status`);
    if (res.ok) setStatus(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5_000);
    return () => clearInterval(timer);
  }, [load]);

  const daemonRunning = status?.daemon === "running";

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center px-6 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
            &larr; Back
          </Link>
          <span className="text-base font-semibold text-[var(--text-primary)]">
            {status?.rig.rigName || "Loading..."}
          </span>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {status?.rig.townPath}
          </span>
        </div>
        {status && (
          <DaemonStatus projectId={id} status={status.daemon} onChange={load} />
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-[var(--border)] overflow-y-auto">
          <AgentTree projectId={id} />
        </aside>
        <main className="flex-1 overflow-y-auto">
          <ReadyBeads projectId={id} />
        </main>
        <aside className="w-80 border-l border-[var(--border)] overflow-hidden flex flex-col">
          <EventFeed projectId={id} enabled={daemonRunning} />
        </aside>
      </div>
    </div>
  );
}
