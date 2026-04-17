"use client";

import type { CommandResult } from "@/types/command-result";

type PermissionsResult = Extract<CommandResult, { command: "permissions" }>;

const TRUST_LABELS: Record<string, string> = {
  full_auto: "Full Auto",
  auto_log: "Auto + Log",
  ask_me: "Ask Me",
};

export function PermissionsCard({ result }: { result: PermissionsResult }) {
  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const { trustLevel, permissionMode, rules } = result.data;

  return (
    <div className="pt-1 space-y-3">
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <span className="eyebrow pt-[1px]">Trust level</span>
        <span className="text-[var(--text-primary)] font-semibold">
          {TRUST_LABELS[trustLevel] || trustLevel}
        </span>

        <span className="eyebrow pt-[1px]">Mode</span>
        <span className="text-[var(--text-secondary)]">{permissionMode}</span>
      </div>

      {rules.length > 0 && (
        <div>
          <div className="eyebrow mb-1">Rules ({rules.length})</div>
          <ul className="space-y-0.5 max-h-32 overflow-y-auto rail-scroll">
            {rules.map((r, i) => (
              <li key={i} className="text-[12px] font-mono text-[var(--text-secondary)] flex gap-2">
                <span className="truncate">{r.toolPattern}</span>
                <span className="text-[var(--text-muted)]">&rarr;</span>
                <span className={r.decision === "allow" ? "text-[var(--active-text)]" : "text-[var(--errored-text)]"}>
                  {r.decision}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rules.length === 0 && (
        <div className="text-[12px] text-[var(--text-muted)]">
          No permission rules set. Using default: {TRUST_LABELS[trustLevel] || trustLevel}
        </div>
      )}
    </div>
  );
}
