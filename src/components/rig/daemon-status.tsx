"use client";

import { useState } from "react";
import type { DaemonStatus as DaemonStatusType } from "@/lib/engines/types";

const colors: Record<DaemonStatusType, string> = {
  running: "bg-[var(--active-text)]",
  stopped: "bg-[var(--errored-text)]",
  starting: "bg-[var(--paused-text)]",
  error: "bg-[var(--errored-text)]",
  unknown: "bg-[var(--text-muted)]",
};

const labels: Record<DaemonStatusType, string> = {
  running: "Daemon running",
  stopped: "Daemon stopped",
  starting: "Daemon starting...",
  error: "Daemon error",
  unknown: "Daemon status unknown",
};

export function DaemonStatus({
  projectId,
  status,
  onChange,
}: {
  projectId: string;
  status: DaemonStatusType;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function trigger(action: "start" | "stop") {
    setBusy(true);
    try {
      const res = await fetch(`/api/rigs/${projectId}/daemon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Failed: ${data.error || "unknown error"}`);
      }
    } finally {
      setBusy(false);
      onChange();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="text-xs text-[var(--text-secondary)]">{labels[status]}</span>
      {status === "stopped" && (
        <button
          onClick={() => trigger("start")}
          disabled={busy}
          className="text-xs px-2 py-0.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Start
        </button>
      )}
      {status === "running" && (
        <button
          onClick={() => trigger("stop")}
          disabled={busy}
          className="text-xs px-2 py-0.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Stop
        </button>
      )}
    </div>
  );
}
