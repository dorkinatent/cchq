"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IngestionPrompt } from "@/components/project/ingestion-prompt";

type Project = { id: string; name: string; path: string };
type BrowseResult = {
  current: string;
  parent: string;
  directories: { name: string; path: string }[];
  isGitRepo: boolean;
};

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
  const [effort, setEffort] = useState("high");
  const [trustLevel, setTrustLevel] = useState("auto_log");
  const [prompt, setPrompt] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [engine, setEngine] = useState<"sdk" | "gastown">("sdk");
  const [townPath, setTownPath] = useState("~/gt");
  const [rigName, setRigName] = useState("");
  const [ingestionPromptProject, setIngestionPromptProject] = useState<{
    id: string;
    fileCount: number;
  } | null>(null);
  const [pendingSessionRedirect, setPendingSessionRedirect] = useState<string | null>(null);

  // Folder browser state
  const [showBrowser, setShowBrowser] = useState(false);
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((data) => {
          setProjects(data);
          // If no projects exist, default to new project mode
          if (data.length === 0) {
            setShowNewProject(true);
          }
        });
    }
  }, [open]);

  async function browseTo(path?: string) {
    setBrowsing(true);
    const params = path ? `?path=${encodeURIComponent(path)}` : "";
    const res = await fetch(`/api/browse${params}`);
    const data = await res.json();
    if (!data.error) {
      setBrowseResult(data);
    }
    setBrowsing(false);
  }

  function handleSelectFolder(path: string) {
    setNewProjectPath(path);
    // Auto-fill project name from folder name
    const folderName = path.split("/").pop() || "";
    if (!newProjectName) {
      setNewProjectName(folderName);
    }
    setShowBrowser(false);
  }

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

    if (engine === "gastown") {
      const rigRes = await fetch(`/api/rigs/${finalProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ townPath, rigName }),
      });
      const rigData = await rigRes.json();
      setSubmitting(false);
      if (!rigRes.ok) {
        alert(`Failed to configure rig: ${rigData.error || "unknown"}`);
        return;
      }

      if (showNewProject && finalProjectId) {
        try {
          const docsRes = await fetch(`/api/projects/${finalProjectId}/docs`);
          if (docsRes.ok) {
            const files = await docsRes.json();
            if (Array.isArray(files) && files.length > 0) {
              setIngestionPromptProject({ id: finalProjectId, fileCount: files.length });
              setPendingSessionRedirect(`/projects/${finalProjectId}/rig`);
              return;
            }
          }
        } catch {
          // silent fail — don't block project creation
        }
      }

      onClose();
      router.push(`/projects/${finalProjectId}/rig`);
      return;
    }

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: finalProjectId,
        name,
        model,
        effort,
        trustLevel,
        prompt,
      }),
    });
    const session = await res.json();
    setSubmitting(false);

    if (showNewProject && finalProjectId) {
      try {
        const docsRes = await fetch(`/api/projects/${finalProjectId}/docs`);
        if (docsRes.ok) {
          const files = await docsRes.json();
          if (Array.isArray(files) && files.length > 0) {
            setIngestionPromptProject({ id: finalProjectId, fileCount: files.length });
            setPendingSessionRedirect(`/sessions/${session.id}`);
            return;
          }
        }
      } catch {
        // silent fail — don't block session creation
      }
    }

    onClose();
    router.push(`/sessions/${session.id}`);
  }

  return (
    <div className="fixed inset-0 backdrop-themed flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-[19px] font-semibold tracking-tight leading-tight text-[var(--text-primary)] mb-5">New session</h2>

        {!showNewProject ? (
          <div className="mb-4">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
              required
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.path}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="text-xs text-[var(--accent)] mt-1 hover:underline"
            >
              + Add new project folder
            </button>
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Directory Path</label>
              <div className="flex gap-2">
                <input
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono"
                  placeholder="/Users/you/Code/project"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowBrowser(true);
                    browseTo(newProjectPath || undefined);
                  }}
                  className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0"
                >
                  Browse
                </button>
              </div>
            </div>

            {/* Folder browser */}
            {showBrowser && browseResult && (
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
                <div className="px-3 py-2 border-b border-[var(--border)] flex justify-between items-center">
                  <span className="text-xs text-[var(--text-secondary)] font-mono truncate">
                    {browseResult.current}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowBrowser(false)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-2"
                  >
                    Close
                  </button>
                </div>

                <div className="flex gap-2 px-3 py-2 border-b border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => browseTo(browseResult.parent)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    .. (up)
                  </button>
                  {browseResult.isGitRepo && (
                    <span className="text-xs text-[var(--active-text)] ml-auto">git repo</span>
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto">
                  {browsing ? (
                    <div className="px-3 py-4 text-xs text-[var(--text-muted)]">Loading...</div>
                  ) : browseResult.directories.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-[var(--text-muted)]">No subdirectories</div>
                  ) : (
                    browseResult.directories.map((dir) => (
                      <div
                        key={dir.path}
                        className="flex justify-between items-center px-3 py-1.5 hover:bg-[var(--surface)] group"
                      >
                        <button
                          type="button"
                          onClick={() => browseTo(dir.path)}
                          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-left flex-1 truncate"
                        >
                          {dir.name}/
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectFolder(dir.path)}
                          className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                        >
                          Select
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="px-3 py-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => handleSelectFolder(browseResult.current)}
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium"
                  >
                    Select this folder
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Project Name</label>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
                placeholder="My Project"
                required
              />
            </div>

            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => setShowNewProject(false)}
                className="text-xs text-[var(--text-secondary)] hover:underline"
              >
                Use existing project
              </button>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Engine</label>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as "sdk" | "gastown")}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="sdk">Claude Code SDK — single-agent chat</option>
            <option value="gastown">Gas Town — multi-agent orchestration</option>
          </select>
        </div>

        {engine === "gastown" && (
          <>
            <div className="mb-4">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Town Path</label>
              <input
                value={townPath}
                onChange={(e) => setTownPath(e.target.value)}
                placeholder="~/gt"
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Rig Name</label>
              <input
                value={rigName}
                onChange={(e) => setRigName(e.target.value)}
                placeholder="rig-slug"
                required={engine === "gastown"}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono"
              />
            </div>
          </>
        )}

        {engine === "sdk" && (
          <>
            <div className="mb-4">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Session Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
                placeholder="Auth refactor"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                <option value="claude-opus-4-6">Opus 4.6</option>
                <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Effort</label>
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="low">Low — quick answers, minimal exploration</option>
                <option value="medium">Medium — balanced</option>
                <option value="high">High — thorough, multi-step work</option>
                <option value="max">Max — exhaustive, no shortcuts</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Permission mode</label>
              <select
                value={trustLevel}
                onChange={(e) => setTrustLevel(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="full_auto">Full auto — never ask, never log</option>
                <option value="auto_log">Auto + log — never ask, log each action in chat</option>
                <option value="ask_me">Ask first — prompt before every tool action</option>
              </select>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Project permission rules override this for specific tools.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Initial prompt <span className="text-[var(--text-muted)] font-normal">· optional</span>
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] h-24 resize-none"
                placeholder="What should Claude work on? Leave blank to start an empty session."
              />
            </div>
          </>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[var(--accent)] text-[var(--bg)] text-sm rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting ? "Starting..." : "Start session"}
          </button>
        </div>
      </form>
      {ingestionPromptProject && (
        <IngestionPrompt
          projectId={ingestionPromptProject.id}
          fileCount={ingestionPromptProject.fileCount}
          onClose={() => {
            setIngestionPromptProject(null);
            onClose();
            if (pendingSessionRedirect) {
              router.push(pendingSessionRedirect);
            }
          }}
        />
      )}
    </div>
  );
}
