"use client";

import { useCallback, useEffect, useState } from "react";
import type { Bead } from "@/lib/engines/types";
import { NewBeadDialog } from "./new-bead-dialog";
import { SlingDialog } from "./sling-dialog";

export function ReadyBeads({ projectId }: { projectId: string }) {
  const [beads, setBeads] = useState<Bead[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [slingBeadId, setSlingBeadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rigs/${projectId}/beads`);
    if (res.ok) setBeads(await res.json());
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          Ready Beads
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="text-xs px-2.5 py-1 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)]"
        >
          + New Bead
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-[var(--text-muted)]">Loading...</div>
      ) : beads.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)] text-center py-6">
          All caught up - create a new bead to get started
        </div>
      ) : (
        <div className="space-y-1.5">
          {beads.map((b) => (
            <div
              key={b.id}
              className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-md p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-[var(--accent)]">{b.id}</span>
                {b.priority && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[var(--paused-bg)] text-[var(--paused-text)] rounded">
                    {b.priority}
                  </span>
                )}
              </div>
              <div className="text-sm text-[var(--text-primary)] mb-2">{b.title}</div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {b.tags?.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] bg-[var(--surface)] text-[var(--text-muted)] px-1.5 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setSlingBeadId(b.id)}
                  className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
                >
                  Sling →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewBeadDialog
        open={newOpen}
        projectId={projectId}
        onClose={() => setNewOpen(false)}
        onCreated={load}
      />
      {slingBeadId && (
        <SlingDialog
          open={true}
          projectId={projectId}
          beadId={slingBeadId}
          onClose={() => setSlingBeadId(null)}
          onSlung={load}
        />
      )}
    </div>
  );
}
