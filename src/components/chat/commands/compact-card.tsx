"use client";

import type { CommandResult } from "@/types/command-result";

type CompactResult = Extract<CommandResult, { command: "compact" }>;

export function CompactCard({ result }: { result: CompactResult }) {
  if (result.status === "running") {
    return (
      <div className="pt-1 text-[13px] text-[var(--text-secondary)] flex items-center gap-2">
        <span className="flex gap-1" aria-hidden>
          <span className="w-1 h-1 bg-[var(--text-muted)] rounded-full thinking-dot" style={{ animationDelay: "0ms" }} />
          <span className="w-1 h-1 bg-[var(--text-muted)] rounded-full thinking-dot" style={{ animationDelay: "200ms" }} />
          <span className="w-1 h-1 bg-[var(--text-muted)] rounded-full thinking-dot" style={{ animationDelay: "400ms" }} />
        </span>
        Compacting conversation
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="pt-1 text-[13px] text-[var(--errored-text)]">
        {result.message || "Compaction failed"}
      </div>
    );
  }

  return (
    <div className="pt-1 text-[13px] text-[var(--text-secondary)]">
      {result.message || "Conversation compacted."}
    </div>
  );
}
