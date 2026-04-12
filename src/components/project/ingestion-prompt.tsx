"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IngestionPrompt({
  projectId,
  fileCount,
  onClose,
}: {
  projectId: string;
  fileCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markPrompted() {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hasBeenIngestionPrompted: true }),
    });
  }

  async function importAll() {
    setBusy(true);
    const docsRes = await fetch(`/api/projects/${projectId}/docs`);
    const files: { relativePath: string }[] = docsRes.ok ? await docsRes.json() : [];
    const paths = files.map((f) => f.relativePath);
    if (paths.length > 0) {
      await fetch(`/api/projects/${projectId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
    }
    await markPrompted();
    setBusy(false);
    onClose();
  }

  async function reviewFirst() {
    await markPrompted();
    onClose();
    router.push(`/projects/${projectId}/settings`);
  }

  async function skip() {
    await markPrompted();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md">
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
          Import project docs as knowledge?
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Found {fileCount} markdown file{fileCount === 1 ? "" : "s"} in this project (README,
          docs/, etc.). CCUI can extract stable facts into this project&apos;s knowledge base so they&apos;re
          auto-injected into future sessions.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={skip}
            disabled={busy}
            className="text-xs px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={reviewFirst}
            disabled={busy}
            className="text-xs px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            Review first
          </button>
          <button
            onClick={importAll}
            disabled={busy}
            className="bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50 text-xs px-3 py-1.5"
          >
            {busy ? "Importing…" : "Import all"}
          </button>
        </div>
      </div>
    </div>
  );
}
