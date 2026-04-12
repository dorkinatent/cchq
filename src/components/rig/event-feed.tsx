"use client";

import { useRigEvents } from "@/hooks/use-rig-events";

const SYMBOLS: Record<string, string> = {
  create: "+",
  created: "+",
  in_progress: "→",
  completed: "✓",
  failed: "✗",
  deleted: "⊘",
  patrol_started: "🦉",
  polecat_nudged: "⚡",
  sling: "🎯",
  handoff: "🤝",
  merge_started: "⚙",
  merged: "✓",
  merge_failed: "✗",
  merge_skipped: "⊘",
  ping: "·",
};

function symbolFor(eventType: string) {
  return SYMBOLS[eventType] || "·";
}

export function EventFeed({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const events = useRigEvents(projectId, enabled);

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-3">
        Event Stream
      </div>
      {events.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">
          {enabled ? "Waiting for events..." : "Daemon stopped"}
        </div>
      ) : (
        <div className="space-y-1 font-mono">
          {events.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="text-[var(--accent)] shrink-0 w-4">
                {symbolFor(e.eventType)}
              </span>
              <span className="text-[var(--text-muted)] shrink-0">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-[var(--text-secondary)] shrink-0">{e.eventType}</span>
              {e.actor && (
                <span className="text-[var(--text-muted)] truncate">{e.actor}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
