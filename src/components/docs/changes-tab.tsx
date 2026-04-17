"use client";

import { useEffect, useState, useRef } from "react";
import { DiffBlock, BinaryFilePlaceholder } from "@/components/chat/diff-block";
import type { MainOverlay } from "@/components/chat/session-context-panel";

type FileSummary = {
  path: string;
  status: "M" | "A" | "D" | "R";
  insertions: number;
  deletions: number;
  binary: boolean;
  hunks: any[];
};

type DiffData = {
  mode: "live" | "saved";
  startSha: string | null;
  endSha: string | null;
  summary: { filesChanged: number; insertions: number; deletions: number };
  files: FileSummary[];
  error?: string;
};

const STATUS_COLOR: Record<string, string> = {
  M: "text-[var(--active-text)]",
  A: "text-[var(--active-text)]",
  D: "text-[var(--errored-text)]",
  R: "text-[var(--accent)]",
};

export function ChangesTab({
  sessionId,
  sessionStatus,
  startSha,
  endSha,
  onExpandToMain,
}: {
  sessionId: string;
  sessionStatus: string;
  startSha?: string | null;
  endSha?: string | null;
  onExpandToMain?: (payload: MainOverlay) => void;
}) {
  const [data, setData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileSummary | null>(null);
  const [fileDiffLoading, setFileDiffLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = sessionStatus === "active";
  const useSaved = !isActive && startSha && endSha;

  // Fetch diff summary (file list only, no per-file hunks needed for the list).
  useEffect(() => {
    let cancelled = false;

    async function fetchDiff() {
      try {
        const modeParam = useSaved ? "?mode=saved" : "";
        const res = await fetch(`/api/sessions/${sessionId}/diff${modeParam}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDiff();

    // Poll every 10s while active.
    if (isActive) {
      intervalRef.current = setInterval(fetchDiff, 10000);
    }

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId, isActive, useSaved]);

  // Fetch single-file diff when accordion opens.
  useEffect(() => {
    if (!expandedFile) {
      setFileDiff(null);
      return;
    }

    let cancelled = false;
    setFileDiffLoading(true);

    const modeParam = useSaved ? "&mode=saved" : "";
    fetch(
      `/api/sessions/${sessionId}/diff?file=${encodeURIComponent(expandedFile)}${modeParam}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.files?.[0]) {
          setFileDiff(json.files[0]);
        }
        setFileDiffLoading(false);
      })
      .catch(() => {
        if (!cancelled) setFileDiffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expandedFile, sessionId, useSaved]);

  if (loading) {
    return <div className="p-4 text-xs text-[var(--text-muted)]">Loading changes…</div>;
  }

  if (data?.error === "not-git") {
    return <div className="p-4 text-xs text-[var(--text-muted)]">Not a git repository</div>;
  }

  if (!data || data.files.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--text-muted)]">
        {isActive ? "No changes yet" : "No changes recorded"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <div className="text-[11px] text-[var(--text-secondary)] tabular-nums">
          <span className="text-[var(--active-text)]">+{data.summary.insertions}</span>
          {" "}
          <span className="text-[var(--errored-text)]">−{data.summary.deletions}</span>
          <span className="text-[var(--text-muted)] ml-2">
            {data.summary.filesChanged} file{data.summary.filesChanged !== 1 ? "s" : ""}
          </span>
        </div>
        {onExpandToMain && (
          <button
            onClick={() => {
              const mode = useSaved ? "saved" : "live";
              onExpandToMain({ kind: "diff", mode } as MainOverlay);
            }}
            className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            Expand ↗
          </button>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto rail-scroll">
        {data.files.map((f) => (
          <div key={f.path}>
            <button
              onClick={() =>
                setExpandedFile((prev) => (prev === f.path ? null : f.path))
              }
              className={`w-full text-left px-4 py-1.5 text-[12px] font-mono flex items-center gap-2 hover:bg-[var(--surface-raised)] ${
                expandedFile === f.path
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              <span className={`font-semibold w-3 shrink-0 ${STATUS_COLOR[f.status] ?? "text-[var(--text-muted)]"}`}>
                {f.status}
              </span>
              <span className="truncate flex-1">{f.path}</span>
              <span className="text-[10px] tabular-nums text-[var(--text-muted)] shrink-0">
                <span className="text-[var(--active-text)]">+{f.insertions}</span>
                {" "}
                <span className="text-[var(--errored-text)]">−{f.deletions}</span>
              </span>
            </button>
            {/* Inline diff accordion */}
            {expandedFile === f.path && (
              <div className="border-t border-b border-[var(--border)] bg-[var(--bg)]">
                {fileDiffLoading ? (
                  <div className="py-3 px-4 text-[11px] text-[var(--text-muted)]">Loading diff…</div>
                ) : fileDiff?.binary ? (
                  <BinaryFilePlaceholder />
                ) : fileDiff ? (
                  <DiffBlock hunks={fileDiff.hunks} />
                ) : (
                  <div className="py-3 px-4 text-[11px] text-[var(--text-muted)]">No diff available</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
