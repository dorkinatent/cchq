"use client";

import { useState } from "react";

export function NewBeadDialog({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/rigs/${projectId}/beads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, assignee: assignee || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      alert(`Failed: ${data.error || "unknown"}`);
      return;
    }
    setTitle("");
    setBody("");
    setAssignee("");
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 backdrop-themed flex items-center justify-center z-50">
      <form
        onSubmit={submit}
        className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md"
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">New Bead</h2>
        <div className="mb-3">
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Body (optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] h-24 resize-none"
          />
        </div>
        <div className="mb-5">
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Assignee (optional)</label>
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="e.g. mayor"
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
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
