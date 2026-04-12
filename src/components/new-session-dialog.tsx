"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Project = { id: string; name: string; path: string };

export function NewSessionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [prompt, setPrompt] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
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

    let finalProjectId = projectId;

    if (showNewProject) {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName, path: newProjectPath }),
      });
      const project = await res.json();
      finalProjectId = project.id;
    }

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: finalProjectId,
        name,
        model,
        prompt,
      }),
    });
    const session = await res.json();
    setSubmitting(false);
    onClose();
    router.push(`/sessions/${session.id}`);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-md"
      >
        <h2 className="text-lg font-semibold text-white mb-4">New Session</h2>

        {!showNewProject ? (
          <div className="mb-4">
            <label className="block text-xs text-neutral-400 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
              required
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="text-xs text-blue-400 mt-1 hover:underline"
            >
              + New project
            </button>
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Project Name</label>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
                placeholder="My Project"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Directory Path</label>
              <input
                value={newProjectPath}
                onChange={(e) => setNewProjectPath(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white font-mono"
                placeholder="/Users/you/Code/project"
                required
              />
            </div>
            <button
              type="button"
              onClick={() => setShowNewProject(false)}
              className="text-xs text-neutral-400 hover:underline"
            >
              Use existing project
            </button>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-neutral-400 mb-1">Session Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
            placeholder="Auth refactor"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs text-neutral-400 mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
          >
            <option value="claude-sonnet-4-6">Sonnet 4.6</option>
            <option value="claude-opus-4-6">Opus 4.6</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
          </select>
        </div>

        <div className="mb-6">
          <label className="block text-xs text-neutral-400 mb-1">Initial Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white h-24 resize-none"
            placeholder="What should Claude work on?"
            required
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Starting..." : "Start Session"}
          </button>
        </div>
      </form>
    </div>
  );
}
