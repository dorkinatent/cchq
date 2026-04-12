"use client";

const colors = {
  connected: "bg-[var(--active-text)]",
  reconnecting: "bg-[var(--paused-text)]",
  disconnected: "bg-[var(--errored-text)]",
};

const labels: Record<string, string | null> = {
  connected: null,
  reconnecting: "Reconnecting...",
  disconnected: "Disconnected",
};

export function ConnectionStatus({
  status,
}: {
  status: "connected" | "reconnecting" | "disconnected";
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block w-2 h-2 rounded-full ${colors[status]} ${
          status === "reconnecting" ? "animate-pulse" : ""
        }`}
      />
      {labels[status] && (
        <span className="text-[11px] text-[var(--text-muted)]">
          {labels[status]}
        </span>
      )}
    </div>
  );
}
