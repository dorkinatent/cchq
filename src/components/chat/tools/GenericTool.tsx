"use client";

import { useState } from "react";

type Props = {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  duration?: number;
};

export function GenericTool({ toolName, input, output, duration }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-[var(--surface)] text-left"
      >
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--text-muted)]">🔧</span>
          <span className="text-[var(--text-primary)] font-medium">{toolName}</span>
        </div>
        <div className="flex items-center gap-2">
          {duration !== undefined && (
            <span className="text-[10px] text-[var(--text-muted)]">{duration}s</span>
          )}
          <span className="text-[var(--text-muted)] text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto max-h-48 overflow-y-auto">
          {JSON.stringify({ input, output }, null, 2)}
        </pre>
      )}
    </div>
  );
}
