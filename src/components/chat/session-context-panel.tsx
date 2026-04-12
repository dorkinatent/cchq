"use client";

import { useEffect, useState } from "react";
import { DocsTab } from "@/components/docs/docs-tab";
import { NotesTab } from "@/components/docs/notes-tab";

type KnowledgeEntry = {
  id: string;
  type: string;
  content: string;
};

type TabKey = "context" | "docs" | "notes";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[12px] text-[var(--text-secondary)] tabular-nums text-right truncate">{value}</span>
    </div>
  );
}

function ContextView({
  projectId,
  projectPath,
  model,
  effort,
  messageCount,
  usage,
}: {
  projectId: string;
  projectPath: string;
  model: string;
  effort?: string;
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

  const shortPath = projectPath.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

  return (
    <div className="px-5 pt-5 pb-4 overflow-y-auto rail-scroll flex-1">
      <div className="mb-6">
        <div className="eyebrow mb-1.5">Working directory</div>
        <div
          className="font-mono text-[12px] text-[var(--text-primary)] break-all leading-snug"
          title={projectPath}
        >
          {shortPath}
        </div>
      </div>

      <div className="mb-6">
        <div className="eyebrow mb-2">Session</div>
        <div className="divide-y divide-[var(--border)]/40">
          <DefRow label="Model" value={<span className="font-mono">{model}</span>} />
          <DefRow label="Effort" value={effort || "high"} />
          <DefRow label="Messages" value={messageCount.toLocaleString()} />
          {usage && (
            <>
              <DefRow label="Turns" value={usage.numTurns.toLocaleString()} />
              <DefRow label="Tokens" value={formatTokens(usage.totalTokens)} />
              <DefRow label="Cost" value={`$${usage.totalCostUsd.toFixed(2)}`} />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="eyebrow mb-2 flex items-center justify-between">
          <span>Injected knowledge</span>
          {knowledge.length > 0 && (
            <span className="text-[var(--text-muted)] tabular-nums normal-case tracking-normal">
              {knowledge.length}
            </span>
          )}
        </div>
        {knowledge.length === 0 ? (
          <div className="text-[12px] text-[var(--text-muted)] leading-relaxed">
            Nothing injected for this project yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {knowledge.map((k) => (
              <li key={k.id} className="text-[12px] leading-relaxed">
                <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--accent)] mb-0.5">
                  {k.type}
                </div>
                <div className="text-[var(--text-secondary)]">{k.content}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SessionContextPanel({
  projectId,
  projectPath,
  model,
  effort,
  messageCount,
  usage,
}: {
  sessionId: string;
  projectId: string;
  projectPath: string;
  model: string;
  effort?: string;
  messageCount: number;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
}) {
  const [tab, setTab] = useState<TabKey>("context");

  return (
    <aside className="w-72 shrink-0 border-l border-[var(--border)] bg-[color-mix(in_oklch,var(--surface)_50%,transparent)] flex flex-col overflow-hidden">
      <nav className="flex border-b border-[var(--border)] px-2">
        {(
          [
            { key: "context", label: "Context" },
            { key: "docs", label: "Docs" },
            { key: "notes", label: "Notes" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-[11px] uppercase tracking-[0.08em] py-2.5 ${
              tab === t.key
                ? "text-[var(--accent)] border-b border-[var(--accent)] -mb-px"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "context" && (
        <ContextView
          projectId={projectId}
          projectPath={projectPath}
          model={model}
          effort={effort}
          messageCount={messageCount}
          usage={usage}
        />
      )}
      {tab === "docs" && (
        <div className="flex-1 overflow-hidden">
          <DocsTab projectId={projectId} projectPath={projectPath} />
        </div>
      )}
      {tab === "notes" && (
        <div className="flex-1 overflow-hidden">
          <NotesTab projectId={projectId} />
        </div>
      )}
    </aside>
  );
}
