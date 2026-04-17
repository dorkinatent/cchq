"use client";

import { useCallback, useEffect, useState } from "react";

type VersionInfo = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  error?: string;
};

export function UpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);

  useEffect(() => {
    const key = "cchq-update-dismissed";
    if (sessionStorage.getItem(key)) {
      setDismissed(true);
      return;
    }

    fetch("/api/system/version")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem("cchq-update-dismissed", "1");
  }, []);

  const triggerUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const res = await fetch("/api/system/update", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setUpdateResult(data.message);
      } else {
        setUpdateResult(
          data.manualCommand
            ? `Run: ${data.manualCommand}`
            : data.error || "Update failed"
        );
      }
    } catch {
      setUpdateResult("Update failed — check your connection");
    } finally {
      setUpdating(false);
    }
  }, []);

  if (dismissed || !info?.updateAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)] px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="font-medium">
          CCHQ v{info.latestVersion} available
        </span>
        <span className="text-[var(--color-text-muted)]">
          (you have v{info.currentVersion})
        </span>
        {info.releaseUrl && (
          <a
            href={info.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-text-link)] underline underline-offset-2"
          >
            Release notes
          </a>
        )}
      </div>
      <div className="flex items-center gap-2">
        {updateResult ? (
          <span className="text-[var(--color-text-muted)] text-xs max-w-[300px] truncate">
            {updateResult}
          </span>
        ) : (
          <button
            onClick={triggerUpdate}
            disabled={updating}
            className="rounded px-3 py-1 text-xs font-medium bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {updating ? "Updating..." : "Update Now"}
          </button>
        )}
        <button
          onClick={dismiss}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
