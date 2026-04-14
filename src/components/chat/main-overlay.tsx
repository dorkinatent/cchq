"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MainOverlay } from "@/components/chat/session-context-panel";
import { DiffBlock, BinaryFilePlaceholder } from "@/components/chat/diff-block";
import type { DiffFile } from "@/lib/git/diff-parser";

type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

const proseClass =
  "prose prose-sm max-w-none prose-p:my-3 prose-headings:my-4 prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--accent)] prose-strong:text-[var(--text-primary)]";

function BackBar({
  crumb,
  onClose,
  right,
}: {
  crumb: React.ReactNode;
  onClose: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-4 px-6 py-3 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--surface)_80%,transparent)] backdrop-blur">
      <button
        onClick={onClose}
        className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        aria-label="Close overlay"
      >
        ← Back
      </button>
      <div className="text-[12px] text-[var(--text-muted)] font-mono truncate flex-1 min-w-0">
        {crumb}
      </div>
      {right && <div className="shrink-0 flex items-center gap-3">{right}</div>}
    </div>
  );
}

export function DocOverlay({
  projectId,
  relativePath,
  onClose,
}: {
  projectId: string;
  relativePath: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/docs/content?path=${encodeURIComponent(relativePath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setContent(typeof data.content === "string" ? data.content : null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, relativePath]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg)]">
      <BackBar
        crumb={
          <>
            <span className="text-[var(--text-muted)]">Docs / </span>
            <span className="text-[var(--text-primary)]">{relativePath}</span>
          </>
        }
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[880px] mx-auto px-10 py-10">
          {loading ? (
            <div className="text-xs text-[var(--text-muted)]">Loading…</div>
          ) : content ? (
            <div className={proseClass}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-xs text-[var(--errored-text)]">Failed to load content.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function NoteOverlay({
  projectId,
  noteId,
  onClose,
}: {
  projectId: string;
  noteId: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/notes`);
    if (res.ok) {
      const list: Note[] = await res.json();
      const found = list.find((n) => n.id === noteId) || null;
      setNote(found);
      if (found) {
        setTitle(found.title);
        setBody(found.content);
      }
    }
    setLoading(false);
    setDirty(false);
  }, [projectId, noteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await fetch(`/api/projects/${projectId}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content: body }),
    });
    setSaving(false);
    setDirty(false);
    await load();
  }

  const crumb = (
    <>
      <span className="text-[var(--text-muted)]">Notes / </span>
      <span className="text-[var(--text-primary)]">{note?.title || (loading ? "…" : "Not found")}</span>
    </>
  );

  const right = note ? (
    <>
      {mode === "edit" ? (
        <>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="text-[11px] rounded px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {showPreview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim() || !dirty}
            className="text-[11px] px-2 py-1 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              if (note) {
                setTitle(note.title);
                setBody(note.content);
              }
              setDirty(false);
              setMode("read");
            }}
            className="text-[11px] rounded px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Done
          </button>
        </>
      ) : (
        <button
          onClick={() => setMode("edit")}
          className="text-[11px] rounded px-2 py-1 text-[var(--accent)] hover:text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Open in editor
        </button>
      )}
    </>
  ) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg)]">
      <BackBar crumb={crumb} onClose={onClose} right={right ?? undefined} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[880px] mx-auto px-10 py-10">
          {loading ? (
            <div className="text-xs text-[var(--text-muted)]">Loading…</div>
          ) : !note ? (
            <div className="text-xs text-[var(--errored-text)]">Note not found.</div>
          ) : mode === "read" ? (
            <>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-6">
                {note.title}
              </h1>
              <div className={proseClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content || ""}</ReactMarkdown>
              </div>
            </>
          ) : (
            <>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                placeholder="Note title"
                aria-label="Note title"
                className="w-full mb-4 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-base text-[var(--text-primary)]"
              />
              {showPreview ? (
                <div
                  className={`${proseClass} bg-[var(--surface-raised)] border border-[var(--border)] rounded p-4 min-h-[40vh]`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Markdown..."
                  aria-label="Note content (markdown)"
                  className="w-full min-h-[60vh] bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono resize-y leading-relaxed"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type DiffResponse = {
  mode: "live" | "saved";
  startSha: string | null;
  endSha: string | null;
  files: DiffFile[];
  summary: { filesChanged: number; insertions: number; deletions: number };
};

export function DiffOverlay({
  sessionId,
  mode,
  onClose,
}: {
  sessionId: string;
  mode: "live" | "saved";
  onClose: () => void;
}) {
  const [data, setData] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedFile(null);
    const url =
      mode === "saved"
        ? `/api/sessions/${sessionId}/diff?mode=saved`
        : `/api/sessions/${sessionId}/diff`;
    fetch(url)
      .then((r) => r.json())
      .then((d: DiffResponse) => {
        if (cancelled) return;
        setData(d);
        if (d.files && d.files.length > 0) {
          setSelectedFile(d.files[0].path);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, mode]);

  const crumb =
    mode === "saved" && data?.startSha && data?.endSha ? (
      <>
        <span className="text-[var(--text-muted)]">Changes · </span>
        <span className="text-[var(--text-primary)]">
          {data.startSha.slice(0, 7)}..{data.endSha.slice(0, 7)}
        </span>
      </>
    ) : (
      <>
        <span className="text-[var(--text-muted)]">Changes · </span>
        <span className="text-[var(--text-primary)]">live</span>
      </>
    );

  const currentFile = data?.files.find((f) => f.path === selectedFile) ?? null;

  function statusColor(status: DiffFile["status"]) {
    if (status === "D") return "text-[var(--errored-text)]";
    if (status === "R") return "text-[var(--accent)]";
    return "text-[var(--active-text)]";
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg)]">
      <BackBar crumb={crumb} onClose={onClose} />
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
          Loading diff…
        </div>
      ) : !data || data.files.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
          No changes
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div
            className="shrink-0 overflow-y-auto border-r border-[var(--border)] py-2"
            style={{ width: 220 }}
          >
            {data.files.map((f) => (
              <button
                key={f.path}
                onClick={() => setSelectedFile(f.path)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] font-mono truncate hover:bg-[var(--surface-raised)] transition-colors ${
                  f.path === selectedFile
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                <span
                  className={`shrink-0 text-[10px] font-semibold w-4 text-center ${statusColor(f.status)}`}
                >
                  {f.status}
                </span>
                <span className="truncate">{f.path}</span>
              </button>
            ))}
          </div>
          {/* Diff area */}
          <div className="flex-1 overflow-y-auto">
            {currentFile ? (
              currentFile.binary ? (
                <BinaryFilePlaceholder />
              ) : (
                <DiffBlock hunks={currentFile.hunks} />
              )
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)] p-8">
                Select a file
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionMainOverlay({
  overlay,
  projectId,
  sessionId,
  onClose,
}: {
  overlay: MainOverlay;
  projectId: string;
  sessionId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!overlay) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, onClose]);

  if (!overlay) return null;
  if (overlay.kind === "doc") {
    return (
      <DocOverlay projectId={projectId} relativePath={overlay.relativePath} onClose={onClose} />
    );
  }
  if (overlay.kind === "note") {
    return <NoteOverlay projectId={projectId} noteId={overlay.id} onClose={onClose} />;
  }
  if (overlay.kind === "diff") {
    return <DiffOverlay sessionId={sessionId} mode={overlay.mode} onClose={onClose} />;
  }
  return null;
}
