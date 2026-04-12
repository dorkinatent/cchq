"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MainOverlay } from "@/components/chat/session-context-panel";

type DocFile = {
  relativePath: string;
  name: string;
  size: number;
  mtime: string;
};

export function DocsTab({
  projectId,
  projectPath,
  onExpandToMain,
}: {
  projectId: string;
  projectPath: string;
  onExpandToMain?: (payload: MainOverlay) => void;
}) {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/docs`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setFiles(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selected) {
      setContent(null);
      return;
    }
    setContentLoading(true);
    fetch(`/api/projects/${projectId}/docs/content?path=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((data) => {
        setContent(typeof data.content === "string" ? data.content : null);
        setContentLoading(false);
      })
      .catch(() => setContentLoading(false));
  }, [projectId, selected]);

  // Group files by top-level folder
  const grouped: Record<string, DocFile[]> = {};
  for (const f of files) {
    const segments = f.relativePath.split("/");
    const group = segments.length > 1 ? segments[0] : "(root)";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(f);
  }

  function openInEditor(relPath: string) {
    const abs = `${projectPath}/${relPath}`;
    window.open(`vscode://file${abs}`, "_blank");
  }

  if (loading) {
    return <div className="p-4 text-xs text-[var(--text-muted)]">Loading docs...</div>;
  }

  if (files.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--text-muted)]">
        No doc files match the configured glob patterns.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="overflow-y-auto border-b border-[var(--border)] max-h-60 shrink-0">
        {Object.entries(grouped).map(([group, items], gIdx) => (
          <div key={group} className={gIdx === 0 ? "pb-2" : "mt-4 pb-2"}>
            <div className="eyebrow px-4 pt-2 pb-1.5">{group}</div>
            {items.map((f) => (
              <button
                key={f.relativePath}
                onClick={() => setSelected(f.relativePath)}
                aria-current={selected === f.relativePath ? "true" : undefined}
                className={`w-full text-left px-4 py-1.5 text-xs font-mono truncate flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-[-2px] ${
                  selected === f.relativePath
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] font-medium"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                }`}
                title={f.relativePath}
              >
                <span aria-hidden="true" className="inline-block w-3 shrink-0 text-[var(--accent)]">
                  {selected === f.relativePath ? "›" : ""}
                </span>
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pt-5 px-4 pb-4">
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-1 mb-4">
              <div className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                {selected}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                {onExpandToMain && (
                  <button
                    onClick={() => onExpandToMain({ kind: "doc", relativePath: selected })}
                    className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    title="Expand to full-width reader"
                  >
                    Expand ↗
                  </button>
                )}
                <button
                  onClick={() => openInEditor(selected)}
                  className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  title="Open in VS Code"
                >
                  ↗ Open
                </button>
              </div>
            </div>
            {contentLoading ? (
              <div className="text-xs text-[var(--text-muted)]">Loading…</div>
            ) : content ? (
              <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--accent)] prose-strong:text-[var(--text-primary)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-xs text-[var(--errored-text)]">Failed to load content.</div>
            )}
          </>
        ) : (
          <div className="text-xs text-[var(--text-muted)]">Pick a file to preview.</div>
        )}
      </div>
    </div>
  );
}
