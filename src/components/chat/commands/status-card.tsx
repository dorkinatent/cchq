"use client";

import type { CommandResult } from "@/types/command-result";

type StatusResult = Extract<CommandResult, { command: "status" }>;

export function StatusCard({ result }: { result: StatusResult }) {
  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const d = result.data;
  const connClass = d.connectionStatus === "connected"
    ? "text-[var(--active-text)]"
    : "text-[var(--errored-text)]";

  return (
    <div className="pt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      <span className="eyebrow pt-[1px]">Connection</span>
      <span className={connClass}>{d.connectionStatus}</span>

      <span className="eyebrow pt-[1px]">Session</span>
      <span className="text-[var(--text-secondary)] font-mono text-[12px]">{d.sdkSessionId || "\u2014"}</span>

      <span className="eyebrow pt-[1px]">State</span>
      <span className="text-[var(--text-secondary)]">
        {d.hasActiveQuery ? `Active \u2014 ${d.currentTool || "thinking"}` : "Idle"}
      </span>

      <span className="eyebrow pt-[1px]">Permissions</span>
      <span className="text-[var(--text-secondary)]">
        {d.pendingPermissions > 0
          ? `${d.pendingPermissions} pending`
          : "None pending"}
      </span>

      <span className="eyebrow pt-[1px]">Model</span>
      <span className="text-[var(--text-secondary)] font-mono text-[12px]">{d.model}</span>

      {d.effort && (
        <>
          <span className="eyebrow pt-[1px]">Effort</span>
          <span className="text-[var(--text-secondary)]">{d.effort}</span>
        </>
      )}

      {d.contextUsage && (
        <>
          <span className="eyebrow pt-[1px]">Context</span>
          <span className="text-[var(--text-secondary)]">
            {d.contextUsage.usedTokens >= 1000
              ? `${(d.contextUsage.usedTokens / 1000).toFixed(1)}k`
              : d.contextUsage.usedTokens}
            {" / "}
            {d.contextUsage.maxTokens >= 1000
              ? `${(d.contextUsage.maxTokens / 1000).toFixed(0)}k`
              : d.contextUsage.maxTokens}
            {" "}
            <span className="text-[var(--text-muted)]">({d.contextUsage.percentUsed}%)</span>
          </span>
        </>
      )}
    </div>
  );
}
