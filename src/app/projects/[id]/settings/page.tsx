"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";

type PermissionRule = {
  id: string;
  toolPattern: string;
  actionPattern: string | null;
  decision: "allow" | "deny" | "ask";
  priority: number;
  createdAt: string;
};

type Project = {
  id: string;
  name: string;
  path: string;
  docGlobs?: string[];
  autoInjectDocs?: boolean;
};

const TOOL_OPTIONS = ["Read", "Edit", "Write", "Bash", "Grep", "Glob", "*"];
const DECISION_OPTIONS = ["allow", "deny", "ask"] as const;
const DECISION_COLORS: Record<string, string> = {
  allow: "bg-[var(--active-bg)] text-[var(--active-text)]",
  deny: "bg-[var(--errored-bg)] text-[var(--errored-text)]",
  ask: "bg-[var(--paused-bg)] text-[var(--paused-text)]",
};

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Doc patterns & ingestion state
  const [docGlobs, setDocGlobs] = useState<string[]>([]);
  const [autoInjectDocs, setAutoInjectDocs] = useState(true);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [newPattern, setNewPattern] = useState("");
  const [ingestModalOpen, setIngestModalOpen] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<{ relativePath: string; name: string }[]>([]);
  const [ingestSelected, setIngestSelected] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState(false);

  // New rule form
  const [showForm, setShowForm] = useState(false);
  const [newTool, setNewTool] = useState("*");
  const [newAction, setNewAction] = useState("");
  const [newDecision, setNewDecision] = useState<"allow" | "deny" | "ask">("ask");
  const [newPriority, setNewPriority] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/rules`).then((r) => r.json()),
    ]).then(([proj, rls]) => {
      setProject(proj);
      setDocGlobs(proj.docGlobs || []);
      setAutoInjectDocs(proj.autoInjectDocs ?? true);
      setRules(rls);
      setLoading(false);
    });
  }, [projectId]);

  async function savePatch(patch: Record<string, unknown>) {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  const refreshMatchCount = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/docs`);
    if (res.ok) {
      const data = await res.json();
      setMatchCount(Array.isArray(data) ? data.length : 0);
    }
  }, [projectId]);

  useEffect(() => {
    refreshMatchCount();
  }, [refreshMatchCount, docGlobs]);

  useEffect(() => {
    if (!ingestModalOpen) return;
    fetch(`/api/projects/${projectId}/docs`)
      .then((r) => r.json())
      .then((data) => {
        setAvailableDocs(Array.isArray(data) ? data : []);
        setIngestSelected(new Set((data || []).map((f: { relativePath: string }) => f.relativePath)));
      });
  }, [ingestModalOpen, projectId]);

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const res = await fetch(`/api/projects/${projectId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolPattern: newTool,
        actionPattern: newAction || null,
        decision: newDecision,
        priority: newPriority,
      }),
    });

    if (res.ok) {
      const rule = await res.json();
      setRules((prev) => [rule, ...prev]);
      setShowForm(false);
      setNewTool("*");
      setNewAction("");
      setNewDecision("ask");
      setNewPriority(0);
    }
    setSubmitting(false);
  }

  async function handleDeleteRule(ruleId: string) {
    await fetch(`/api/projects/${projectId}/rules?ruleId=${ruleId}`, {
      method: "DELETE",
    });
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm"
        >
          &larr; Back
        </Link>
        <h1 className="text-[19px] font-semibold tracking-tight leading-tight text-[var(--text-primary)]">
          {project?.name} <span className="text-[var(--text-muted)] font-normal">· Permissions</span>
        </h1>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-[68ch]">
        Permission rules decide what Claude can do in this project&apos;s sessions.
        Rules are evaluated top-down — specific tool patterns match before wildcards.
        If no rule matches, the session&apos;s permission mode applies.
      </p>

      {/* Rules list */}
      <div className="space-y-2 mb-6">
        {rules.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)] py-8 text-center border border-dashed border-[var(--border)] rounded-lg">
            No rules yet. Sessions will fall back to their permission mode for every action.
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-3 px-4 py-3 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg"
            >
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${DECISION_COLORS[rule.decision]}`}>
                {rule.decision}
              </span>
              <span className="text-sm text-[var(--text-primary)] font-mono">
                {rule.toolPattern}
              </span>
              {rule.actionPattern && (
                <span className="text-xs text-[var(--text-muted)] font-mono truncate max-w-[200px]">
                  /{rule.actionPattern}/
                </span>
              )}
              <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                priority: {rule.priority}
              </span>
              <button
                onClick={() => handleDeleteRule(rule.id)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--errored-text)] ml-2"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add rule form */}
      {showForm ? (
        <form
          onSubmit={handleAddRule}
          className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-4 space-y-3"
        >
          <h3 className="text-sm font-medium text-[var(--text-primary)]">New Rule</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Tool</label>
              <select
                value={newTool}
                onChange={(e) => setNewTool(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {TOOL_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t === "*" ? "* (all tools)" : t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Decision</label>
              <select
                value={newDecision}
                onChange={(e) => setNewDecision(e.target.value as "allow" | "deny" | "ask")}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {DECISION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Action Pattern <span className="text-[var(--text-muted)]">(regex, optional)</span>
            </label>
            <input
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono"
              placeholder="e.g. rm.*-rf or sudo.* or /etc/.*"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Priority <span className="text-[var(--text-muted)]">(higher = evaluated first)</span>
            </label>
            <input
              type="number"
              value={newPriority}
              onChange={(e) => setNewPriority(parseInt(e.target.value) || 0)}
              className="w-24 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] text-sm rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Rule"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          + Add Permission Rule
        </button>
      )}

      {/* Doc Patterns */}
      <section className="mb-8 mt-8 border-t border-[var(--border)] pt-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Doc Patterns</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Glob patterns for markdown files to surface in the Docs tab.
          {matchCount !== null && ` Matches ${matchCount} file${matchCount === 1 ? "" : "s"}.`}
        </p>
        <div className="space-y-1 mb-3">
          {docGlobs.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 font-mono text-xs bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1 text-[var(--text-primary)]">
                {g}
              </span>
              <button
                onClick={async () => {
                  const next = docGlobs.filter((_, idx) => idx !== i);
                  setDocGlobs(next);
                  await savePatch({ docGlobs: next });
                }}
                className="text-xs text-[var(--errored-text)] hover:text-[var(--errored-text)]"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="docs/**/*.md"
            className="flex-1 font-mono text-xs bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1.5 text-[var(--text-primary)]"
          />
          <button
            onClick={async () => {
              const trimmed = newPattern.trim();
              if (!trimmed) return;
              const next = [...docGlobs, trimmed];
              setDocGlobs(next);
              setNewPattern("");
              await savePatch({ docGlobs: next });
            }}
            className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)]"
          >
            Add
          </button>
        </div>
      </section>

      {/* Auto-Inject Docs */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Auto-Inject Docs</h2>
        <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={autoInjectDocs}
            onChange={async (e) => {
              setAutoInjectDocs(e.target.checked);
              await savePatch({ autoInjectDocs: e.target.checked });
            }}
          />
          <span>Inject matched doc file contents into every new session&apos;s system prompt.</span>
        </label>
      </section>

      {/* Doc Ingestion */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Doc Ingestion</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Extract stable facts from matched docs and add them to the knowledge base.
        </p>
        <button
          onClick={() => setIngestModalOpen(true)}
          className="text-xs px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Scan &amp; Ingest Docs
        </button>
      </section>

      {/* Common presets */}
      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Quick Presets</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              createPresetRule("Bash", "rm.*-rf", "deny", 20);
            }}
            className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Block rm -rf
          </button>
          <button
            onClick={() => {
              createPresetRule("Bash", "sudo.*", "ask", 20);
            }}
            className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Ask before sudo
          </button>
          <button
            onClick={() => {
              createPresetRule("Read", null, "allow", 5);
            }}
            className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Auto-allow reads
          </button>
          <button
            onClick={() => {
              createPresetRule("Edit", null, "ask", 5);
            }}
            className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Ask before edits
          </button>
        </div>
      </div>

      {/* Ingestion modal */}
      {ingestModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">
              Ingest Docs
            </h3>
            <div className="flex-1 overflow-y-auto mb-4 space-y-1.5">
              {availableDocs.map((d) => (
                <label key={d.relativePath} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ingestSelected.has(d.relativePath)}
                    onChange={(e) => {
                      const next = new Set(ingestSelected);
                      if (e.target.checked) next.add(d.relativePath);
                      else next.delete(d.relativePath);
                      setIngestSelected(next);
                    }}
                  />
                  <span className="font-mono text-[var(--text-secondary)] truncate">{d.relativePath}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIngestModalOpen(false)}
                className="text-xs px-3 py-1.5 text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                disabled={ingesting || ingestSelected.size === 0}
                onClick={async () => {
                  setIngesting(true);
                  const res = await fetch(`/api/projects/${projectId}/ingest`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paths: [...ingestSelected] }),
                  });
                  setIngesting(false);
                  if (res.ok) {
                    const data = await res.json();
                    alert(`Ingested ${data.entriesCreated} entries across ${Object.keys(data.byFile).length} files.`);
                    setIngestModalOpen(false);
                  } else {
                    alert("Ingestion failed");
                  }
                }}
                className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {ingesting ? "Ingesting…" : `Ingest ${ingestSelected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function createPresetRule(
    toolPattern: string,
    actionPattern: string | null,
    decision: "allow" | "deny" | "ask",
    priority: number
  ) {
    const res = await fetch(`/api/projects/${projectId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolPattern, actionPattern, decision, priority }),
    });
    if (res.ok) {
      const rule = await res.json();
      setRules((prev) => [rule, ...prev]);
    }
  }
}
