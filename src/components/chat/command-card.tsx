"use client";

import type { CommandResult } from "@/types/command-result";
import { CostCard } from "./commands/cost-card";

// These will be created in subsequent tasks — lazy-load or stub
const StubCard = ({ command }: { command: string }) => (
  <div className="text-[13px] text-[var(--text-muted)] pt-1">
    /{command} handler coming soon
  </div>
);

export function CommandCard({
  result,
  sessionId,
  onSessionUpdate,
}: {
  result: CommandResult;
  sessionId: string;
  onSessionUpdate?: () => void;
}) {
  const inner = (() => {
    switch (result.command) {
      case "cost":
        return <CostCard data={result.data} />;
      case "model":
        return <StubCard command="model" />;
      case "mcp":
        return <StubCard command="mcp" />;
      case "status":
        return <StubCard command="status" />;
      case "permissions":
        return <StubCard command="permissions" />;
      case "compact":
        return <StubCard command="compact" />;
      case "config":
        return <StubCard command="config" />;
    }
  })();

  return (
    <div className="max-w-[min(96%,720px)] border border-[var(--border)] rounded-md overflow-hidden bg-[color-mix(in_oklch,var(--surface-raised)_50%,transparent)]">
      <header className="px-4 pt-2.5 pb-1.5 flex items-center gap-2">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          /{result.command}
        </span>
        {"status" in result && result.status === "loading" && (
          <span className="text-[11px] text-[var(--text-muted)]">Fetching...</span>
        )}
        {"status" in result && result.status === "error" && (
          <span className="text-[11px] text-[var(--text-muted)]">
            {"error" in result && typeof result.error === "string" ? result.error : "Could not fetch — session may be disconnected"}
          </span>
        )}
      </header>
      <div className="px-4 pb-3">{inner}</div>
    </div>
  );
}
