"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

export function NotesTab({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/notes`);
    if (res.ok) {
      setNotes(await res.json());
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId("__new__");
    setDraftTitle("");
    setDraftContent("");
    setShowPreview(false);
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setDraftTitle(note.title);
    setDraftContent(note.content);
    setShowPreview(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftTitle("");
    setDraftContent("");
  }

  async function save() {
    if (!draftTitle.trim()) return;
    setSaving(true);
    if (editingId === "__new__") {
      await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle, content: draftContent }),
      });
    } else if (editingId) {
      await fetch(`/api/projects/${projectId}/notes/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle, content: draftContent }),
      });
    }
    setSaving(false);
    cancelEdit();
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/projects/${projectId}/notes/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return <div className="p-4 text-xs text-[var(--text-muted)]">Loading notes...</div>;
  }

  if (editingId) {
    return (
      <div className="flex flex-col h-full overflow-hidden p-4">
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="Note title"
          className="mb-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        <div className="flex items-center gap-2 mb-2 text-xs">
          <button
            onClick={() => setShowPreview(false)}
            className={showPreview ? "text-[var(--text-muted)]" : "text-[var(--accent)]"}
          >
            Edit
          </button>
          <span className="text-[var(--text-muted)]">·</span>
          <button
            onClick={() => setShowPreview(true)}
            className={showPreview ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}
          >
            Preview
          </button>
        </div>
        {showPreview ? (
          <div className="flex-1 overflow-y-auto prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--accent)] prose-strong:text-[var(--text-primary)] bg-[var(--surface-raised)] border border-[var(--border)] rounded p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftContent}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            placeholder="Markdown..."
            className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono resize-none"
          />
        )}
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={cancelEdit} className="text-xs px-3 py-1.5 text-[var(--text-secondary)]">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !draftTitle.trim()}
            className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">Notes</div>
        <button
          onClick={startNew}
          className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          + New note
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">
          No notes yet. Use these for cross-session scratch thoughts.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="bg-[var(--surface-raised)] border border-[var(--border)] rounded p-3">
              <div className="flex items-start justify-between mb-1">
                <div className="text-sm text-[var(--text-primary)] font-medium">{n.title}</div>
                <div className="flex gap-2 shrink-0 ml-2">
                  <button
                    onClick={() => startEdit(n)}
                    className="text-[11px] text-[var(--accent)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(n.id)}
                    className="text-[11px] text-[var(--errored-text)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="text-xs text-[var(--text-muted)] line-clamp-3 whitespace-pre-wrap">
                {n.content || "(empty)"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
