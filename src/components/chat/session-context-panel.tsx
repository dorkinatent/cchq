"use client";

import { useEffect, useState } from "react";

type KnowledgeEntry = {
  id: string;
  type: string;
  content: string;
};

export function SessionContextPanel({
  sessionId,
  projectId,
  projectPath,
  model,
  messageCount,
  usage,
}: {
  sessionId: string;
  projectId: string;
  projectPath: string;
  model: string;
  messageCount: number;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
}) {
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);

  useEffect(() => {
    if (projectId) {
      fetch(`/api/knowledge?projectId=${projectId}`)
        .then((r) => r.json())
        .then((entries) => setKnowledge(entries.slice(0, 10)));
    }
  }, [projectId]);

  return (
    <div className="w-64 border-l border-[var(--border)] p-4 overflow-y-auto shrink-0">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-3">
        Session Context
      </div>

      <div className="bg-[var(--surface-raised)] rounded-md p-2.5 mb-2.5">
        <div className="text-[11px] text-[var(--text-muted)] mb-1">Working Directory</div>
        <div className="text-xs text-[var(--text-secondary)] font-mono truncate">{projectPath}</div>
      </div>

      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mt-4 mb-2">
        Injected Knowledge
      </div>
      {knowledge.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">No knowledge entries for this project.</div>
      ) : (
        knowledge.map((k) => (
          <div
            key={k.id}
            className="bg-[var(--active-bg)] border border-[var(--active-bg)] rounded-md p-2.5 mb-2"
          >
            <div className="text-[11px] text-[var(--active-text)] mb-1">{k.type}</div>
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">{k.content}</div>
          </div>
        ))
      )}

      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mt-4 mb-2">
        Session Stats
      </div>
      <div className="text-xs text-[var(--text-muted)] leading-loose">
        Messages: {messageCount}<br />
        Model: {model}
        {usage && (
          <>
            <br />
            Tokens: {usage.totalTokens.toLocaleString()}
            <br />
            Cost: ${usage.totalCostUsd.toFixed(4)}
            <br />
            Turns: {usage.numTurns}
          </>
        )}
      </div>
    </div>
  );
}
