"use client";

import { useState } from "react";

export type ApprovalLogEntry = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: number;
  /** Brief summary like "3 lines changed" */
  summary?: string;
};

export function AutoApprovalLog({ entry }: { entry: ApprovalLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  const time = new Date(entry.timestamp).toLocaleTimeString();

  // Build a concise description
  let description = entry.toolName;
  if (entry.input.file_path) {
    description += ` ${entry.input.file_path}`;
  }
  if (entry.input.command) {
    const cmd = String(entry.input.command);
    description += ` ${cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd}`;
  }
  if (entry.summary) {
    description += ` (${entry.summary})`;
  }

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-2 px-4 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface)] rounded transition-colors"
      >
        <span className="text-[var(--active-text)]">✓</span>
        <span className="truncate">{description}</span>
        <span className="ml-auto shrink-0 tabular-nums">{time}</span>
        <span className="shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mx-4 mt-1 mb-2 bg-[var(--bg)] border border-[var(--border)] rounded-md p-3 text-xs font-mono">
          {Object.entries(entry.input).map(([key, value]) => (
            <div key={key} className="flex gap-2 py-0.5">
              <span className="text-[var(--text-muted)] shrink-0">{key}:</span>
              <span className="text-[var(--text-secondary)] break-all">
                {typeof value === "string"
                  ? value.length > 200
                    ? value.slice(0, 200) + "..."
                    : value
                  : JSON.stringify(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A group of auto-approval log entries rendered together.
 * Used when multiple approvals happen in quick succession.
 */
export function AutoApprovalLogGroup({ entries }: { entries: ApprovalLogEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="my-2 border-l-2 border-[var(--border)] ml-4">
      {entries.map((entry) => (
        <AutoApprovalLog key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
