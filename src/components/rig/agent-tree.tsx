"use client";

import { useEffect, useState } from "react";
import type { Agent, AgentState } from "@/lib/engines/types";

const stateSymbol: Record<AgentState, string> = {
  working: "●",
  idle: "○",
  stalled: "⚠",
  gupp: "🔥",
  zombie: "💀",
  unknown: "·",
};

const stateColor: Record<AgentState, string> = {
  working: "text-[var(--active-text)]",
  idle: "text-[var(--text-muted)]",
  stalled: "text-[var(--paused-text)]",
  gupp: "text-[var(--errored-text)]",
  zombie: "text-[var(--errored-text)]",
  unknown: "text-[var(--text-muted)]",
};

export function AgentTree({ projectId }: { projectId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/rigs/${projectId}/agents`);
      if (res.ok) {
        setAgents(await res.json());
      }
      setLoading(false);
    }
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [projectId]);

  const byRole = new Map<string, Agent[]>();
  for (const a of agents) {
    if (!byRole.has(a.role)) byRole.set(a.role, []);
    byRole.get(a.role)!.push(a);
  }

  return (
    <div className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-3">
        Agents
      </div>
      {loading ? (
        <div className="text-xs text-[var(--text-muted)]">Loading...</div>
      ) : agents.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">No agents running</div>
      ) : (
        [...byRole.entries()].map(([role, roleAgents]) => (
          <div key={role} className="mb-4">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
              {role}
            </div>
            {roleAgents.map((a) => (
              <div key={a.name} className="flex items-start gap-2 py-1 text-xs">
                <span className={`${stateColor[a.state]} shrink-0`}>
                  {stateSymbol[a.state]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--text-primary)] truncate">{a.name}</div>
                  <div className="text-[var(--text-muted)] truncate">
                    {a.lastActivity}
                  </div>
                  {a.currentBead && (
                    <div className="text-[var(--accent)] font-mono">{a.currentBead}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
