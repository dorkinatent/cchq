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
  const [progress, setProgress] = useState({ current: 0, total: 0, file: "" });
  const [knowledgeCount, setKnowledgeCount] = useState(0);

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
    setProgress({ current: 0, total: paths.length, file: "" });

    let totalEntries = 0;
    for (let i = 0; i < paths.length; i++) {
      setProgress({ current: i + 1, total: paths.length, file: paths[i] });
      try {
        const res = await fetch(`/api/projects/${projectId}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: [paths[i]] }),
        });
        if (res.ok) {
          const data = await res.json();
          totalEntries += data.entriesCreated ?? 0;
          setKnowledgeCount(totalEntries);
        }
      } catch {
        // continue with next file
      }
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
    <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg px-4 py-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)]">
          Import project docs as knowledge?
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Found {fileCount} markdown file{fileCount === 1 ? "" : "s"} (README, docs/, etc.). CCHQ can
          extract stable facts into this project&apos;s knowledge base so they&apos;re auto-injected
          into future sessions.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={skip}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Skip
        </button>
        <button
          onClick={reviewFirst}
          disabled={busy}
          className="text-xs px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Review first
        </button>
        <button
          onClick={importAll}
          disabled={busy}
          className="bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50 text-xs px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]"
        >
          {busy ? `${progress.current}/${progress.total}` : "Import all"}
        </button>
      </div>
      {busy && (
        <div className="w-full mt-2">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1">
            <span className="truncate max-w-[60%]">{progress.file}</span>
            <span>{knowledgeCount} fact{knowledgeCount === 1 ? "" : "s"} extracted</span>
          </div>
          <div className="h-1 bg-[var(--surface)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
              style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "0%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
