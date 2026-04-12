"use client";

import { useState, useEffect } from "react";

type Project = { id: string; name: string };

export function KnowledgeForm({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<"decision" | "fact" | "context" | "summary">("fact");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/projects")
        .then((r) => r.json())
        .then(setProjects);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        type,
        content,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });

    setSubmitting(false);
    setContent("");
    setTagsInput("");
    onSubmit();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-md"
      >
        <h2 className="text-lg font-semibold text-white mb-4">Add Knowledge Entry</h2>

        <div className="mb-3">
          <label className="block text-xs text-neutral-400 mb-1">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
            required
          >
            <option value="">Select project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-neutral-400 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "decision" | "fact" | "context" | "summary")}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
          >
            <option value="decision">Decision</option>
            <option value="fact">Fact</option>
            <option value="context">Context</option>
            <option value="summary">Summary</option>
          </select>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-neutral-400 mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white h-24 resize-none"
            required
          />
        </div>

        <div className="mb-5">
          <label className="block text-xs text-neutral-400 mb-1">Tags (comma-separated)</label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
            placeholder="auth, api, migration"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-400 hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add Entry"}
          </button>
        </div>
      </form>
    </div>
  );
}
