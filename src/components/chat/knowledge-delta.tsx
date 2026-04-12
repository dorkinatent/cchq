"use client";

import { useEffect, useState } from "react";

type KnowledgeEntry = {
  id: string;
  type: string;
  content: string;
  createdAt: string;
};

export function KnowledgeDelta({ projectId, since }: { projectId: string; since: string }) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/knowledge?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data: KnowledgeEntry[]) => {
        const sinceDate = new Date(since).getTime();
        const newer = data.filter((e) => new Date(e.createdAt).getTime() > sinceDate);
        setEntries(newer);
      })
      .catch(() => setEntries([]));
  }, [projectId, since]);

  if (entries.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="bg-[var(--accent)] text-[var(--bg)] text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
          {entries.length}
        </span>
        <span>new knowledge {entries.length === 1 ? "entry" : "entries"} since pause</span>
        <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <ul className="mt-2 space-y-1.5 text-xs text-[var(--text-secondary)] bg-[color-mix(in_oklch,var(--surface-raised)_45%,transparent)] rounded-md px-3 py-2">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="eyebrow normal-case tracking-normal text-[var(--accent)] mr-1.5">{e.type}</span>
              {e.content.length > 120 ? e.content.slice(0, 120) + "…" : e.content}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
