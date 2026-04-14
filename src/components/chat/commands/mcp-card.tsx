"use client";

import { useState } from "react";
import type { CommandResult, McpServer } from "@/types/command-result";

type McpResult = Extract<CommandResult, { command: "mcp" }>;

const STATUS_INDICATORS: Record<McpServer["status"], { char: string; className: string }> = {
  connected: { char: "\u2713", className: "text-[var(--active-text)]" },
  "needs-auth": { char: "\u26A0", className: "text-[var(--paused-text)]" },
  failed: { char: "\u2717", className: "text-[var(--errored-text)]" },
  pending: { char: "\u2026", className: "text-[var(--text-muted)]" },
  disabled: { char: "\u25CB", className: "text-[var(--text-muted)]" },
};

const STATUS_LABELS: Record<McpServer["status"], string> = {
  connected: "connected",
  "needs-auth": "needs authentication",
  failed: "failed",
  pending: "pending",
  disabled: "disabled",
};

export function McpCard({ result }: { result: McpResult }) {
  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const { servers } = result.data;

  const groups = new Map<string, McpServer[]>();
  for (const s of servers) {
    const scope = s.scope || "other";
    if (!groups.has(scope)) groups.set(scope, []);
    groups.get(scope)!.push(s);
  }

  const scopeLabels: Record<string, string> = {
    claudeai: "claude.ai",
    managed: "Built-in MCPs",
    user: "User",
    project: "Project",
    local: "Local",
  };

  return (
    <div className="pt-1 space-y-3">
      <div className="text-[13px] text-[var(--text-secondary)]">
        {servers.length} server{servers.length !== 1 ? "s" : ""}
      </div>
      {Array.from(groups.entries()).map(([scope, group]) => (
        <div key={scope} className="space-y-1">
          <div className="text-[12px] font-semibold text-[var(--text-primary)]">
            {scopeLabels[scope] || scope}{" "}
            {scope === "managed" && (
              <span className="font-normal text-[var(--text-muted)]">(always available)</span>
            )}
          </div>
          {group.map((server) => (
            <ServerRow key={server.name} server={server} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ServerRow({ server }: { server: McpServer }) {
  const [expanded, setExpanded] = useState(false);
  const indicator = STATUS_INDICATORS[server.status] || STATUS_INDICATORS.pending;
  const label = STATUS_LABELS[server.status] || server.status;
  const hasTools = server.tools && server.tools.length > 0;

  return (
    <div className="pl-3">
      <div className="flex items-center gap-2 text-[13px]">
        {hasTools ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[11px] w-3 shrink-0"
          >
            {expanded ? "\u25BC" : "\u25B6"}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-[var(--text-primary)]">{server.name}</span>
        <span className="text-[var(--text-muted)]">&middot;</span>
        <span className={indicator.className}>{indicator.char}</span>
        <span className="text-[var(--text-muted)] text-[12px]">{label}</span>
      </div>
      {expanded && hasTools && (
        <ul className="pl-8 pt-1 space-y-0.5">
          {server.tools!.map((tool) => (
            <li key={tool.name} className="text-[12px] text-[var(--text-secondary)] font-mono truncate">
              {tool.name}
            </li>
          ))}
        </ul>
      )}
      {server.error && (
        <div className="pl-8 text-[11px] text-[var(--errored-text)]">{server.error}</div>
      )}
    </div>
  );
}
