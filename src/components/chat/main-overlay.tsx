"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MainOverlay } from "@/components/chat/session-context-panel";

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
        <div className="max-w-prose mx-auto px-6 py-8">
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
        <div className="max-w-prose mx-auto px-6 py-8">
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

export function SessionMainOverlay({
  overlay,
  projectId,
  onClose,
}: {
  overlay: MainOverlay;
  projectId: string;
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
  return <NoteOverlay projectId={projectId} noteId={overlay.id} onClose={onClose} />;
}
