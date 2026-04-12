"use client";

import Link from "next/link";
import type { ToolErrorNotice } from "@/hooks/use-session-stream";

export function ToolErrorNoticeList({
  errors,
  projectId,
  onDismiss,
}: {
  errors: ToolErrorNotice[];
  projectId: string;
  onDismiss: (id: string) => void;
}) {
  if (errors.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Blocked tool calls"
      className="mx-5 mt-3 flex flex-col gap-2"
    >
      {errors.map((e) => {
        const isPath = e.hint === "path_outside_cwd";
        const isPerm = e.hint === "permission_denied";
        const headline = isPath
          ? `Blocked: ${e.toolName || "tool"} tried a path outside this project's working directory.`
          : isPerm
          ? `Blocked: ${e.toolName || "tool"} was denied by your permission rules.`
          : `Tool error from ${e.toolName || "tool"}.`;
        return (
          <div
            key={e.id}
            className="bg-[var(--errored-bg)] border border-[var(--errored-border)] rounded-lg px-4 py-3 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[var(--errored-text)] font-medium">{headline}</div>
                <div className="text-[var(--text-secondary)] text-xs mt-1 font-mono whitespace-pre-wrap break-all">
                  {e.message}
                </div>
                {isPath && (
                  <div className="text-xs text-[var(--text-secondary)] mt-2">
                    Add the path to{" "}
                    <Link
                      href={`/projects/${projectId}/settings`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Additional Directories
                    </Link>
                    , or switch the session to <span className="font-mono">full_auto</span> to skip
                    the guardrail entirely.
                  </div>
                )}
                {isPerm && (
                  <div className="text-xs text-[var(--text-secondary)] mt-2">
                    Edit your{" "}
                    <Link
                      href={`/projects/${projectId}/settings`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      permission rules
                    </Link>{" "}
                    or raise the session&apos;s trust level.
                  </div>
                )}
              </div>
              <button
                onClick={() => onDismiss(e.id)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded px-1"
                aria-label="Dismiss notice"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
