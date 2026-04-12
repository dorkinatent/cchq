"use client";

import type { QueuedMessage } from "@/lib/message-queue";

export function MessageStatus({
  message,
  onRetry,
  onRemove,
}: {
  message: QueuedMessage;
  onRetry: () => void;
  onRemove: () => void;
}) {
  if (message.status === "sent") return null;

  if (message.status === "queued" || message.status === "sending") {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <span className="inline-block w-3 h-3 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
        <span className="text-[11px] text-[var(--text-muted)]">Sending...</span>
      </div>
    );
  }

  // status === "failed"
  return (
    <div className="mt-1 border border-[var(--errored-text)] rounded px-2 py-1.5 flex items-center gap-2">
      <span className="text-[11px] text-[var(--errored-text)]">
        Failed{message.error ? `: ${message.error}` : ""}
      </span>
      {message.attempts < message.maxAttempts && (
        <button
          onClick={onRetry}
          className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Retry
        </button>
      )}
      <button
        onClick={onRemove}
        className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--errored-text)]"
      >
        Delete
      </button>
    </div>
  );
}
