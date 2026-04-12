"use client";

import { useState } from "react";

export function SlingDialog({
  open,
  projectId,
  beadId,
  onClose,
  onSlung,
}: {
  open: boolean;
  projectId: string;
  beadId: string;
  onClose: () => void;
  onSlung: () => void;
}) {
  const [target, setTarget] = useState("mayor");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/rigs/${projectId}/beads/${beadId}/sling`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      alert(`Failed: ${data.error || "unknown"}`);
      return;
    }
    onSlung();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={submit}
        className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-sm"
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Sling {beadId}</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Pick an assignee</p>
        <div className="mb-5">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
            placeholder="mayor or polecat name"
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[var(--accent)] text-[var(--bg)] text-sm rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting ? "Slinging..." : "Sling"}
          </button>
        </div>
      </form>
    </div>
  );
}
