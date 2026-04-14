"use client";

import type { CommandResult } from "@/types/command-result";
import { CostCard } from "./commands/cost-card";
import { ModelCard } from "./commands/model-card";
import { McpCard } from "./commands/mcp-card";
import { StatusCard } from "./commands/status-card";
import { PermissionsCard } from "./commands/permissions-card";
import { CompactCard } from "./commands/compact-card";
import { ConfigCard } from "./commands/config-card";

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
        return (
          <ModelCard
            result={result}
            sessionId={sessionId}
            onSessionUpdate={onSessionUpdate}
          />
        );
      case "mcp":
        return <McpCard result={result} />;
      case "status":
        return <StatusCard result={result} />;
      case "permissions":
        return <PermissionsCard result={result} />;
      case "compact":
        return <CompactCard result={result} />;
      case "config":
        return (
          <ConfigCard
            result={result}
            sessionId={sessionId}
            onSessionUpdate={onSessionUpdate}
          />
        );
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
            {"error" in result && typeof result.error === "string"
              ? result.error
              : "Could not fetch \u2014 session may be disconnected"}
          </span>
        )}
      </header>
      <div className="px-4 pb-3">{inner}</div>
    </div>
  );
}
