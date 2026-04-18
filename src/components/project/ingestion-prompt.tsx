"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

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
  const { toast } = useToast();

  async function markPrompted() {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hasBeenIngestionPrompted: true }),
    });
  }

  async function importAll() {
    setBusy(true);
    try {
      const docsRes = await fetch(`/api/projects/${projectId}/docs`);
      if (!docsRes.ok) throw new Error("Failed to load project docs");
      const files: { relativePath: string }[] = await docsRes.json();
      const paths = files.map((f) => f.relativePath);
      await markPrompted();
      // Dismiss immediately — the import runs in the background.
      onClose();
      toast(`Importing ${paths.length} doc${paths.length === 1 ? "" : "s"} in the background…`);
      if (paths.length > 0) {
        void fetch(`/api/projects/${projectId}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths }),
        })
          .then((res) => {
            if (!res.ok) {
              toast("Background import failed. Please retry from Settings.", { variant: "error" });
            }
          })
          .catch(() => {
            toast("Background import failed. Please retry from Settings.", { variant: "error" });
          });
      }
    } catch {
      // Don't mark as prompted — let the user retry on transient failures.
      toast("Could not load docs to import. Please retry.", { variant: "error" });
      setBusy(false);
      return;
    }
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
          {busy ? "Importing…" : "Import all"}
        </button>
      </div>
    </div>
  );
}
