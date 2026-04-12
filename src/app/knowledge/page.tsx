"use client";

import { useEffect, useState, useCallback } from "react";
import { KnowledgeList } from "@/components/knowledge/knowledge-list";
import { KnowledgeForm } from "@/components/knowledge/knowledge-form";

type Entry = {
  id: string;
  projectId: string;
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
  createdAt: string;
  sessionId: string | null;
};

type Project = { id: string; name: string };

export default function KnowledgePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [filterProject, setFilterProject] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

  const fetchEntries = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterProject) params.set("projectId", filterProject);
    if (filterType) params.set("type", filterType);
    if (search) params.set("search", search);

    const res = await fetch(`/api/knowledge?${params}`);
    setEntries(await res.json());
    setLoading(false);
  }, [filterProject, filterType, search]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects);
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleDelete(id: string) {
    await fetch(`/api/knowledge?id=${id}`, { method: "DELETE" });
    fetchEntries();
  }

  return (
    <div>
      <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-[var(--text-primary)]">Knowledge Base</h1>
          <span className="text-xs text-[var(--text-secondary)]">{entries.length} entries</span>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge..."
            className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] w-52 placeholder-[var(--text-muted)]"
          />
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <option value="">All Types</option>
            <option value="decision">Decision</option>
            <option value="fact">Fact</option>
            <option value="context">Context</option>
            <option value="summary">Summary</option>
          </select>
          <button
            onClick={() => setFormOpen(true)}
            className="bg-[var(--accent)] text-[var(--bg)] px-3.5 py-1.5 rounded-md text-sm font-medium hover:bg-[var(--accent-hover)]"
          >
            + Add Entry
          </button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-[var(--text-secondary)] text-sm">Loading...</div>
        ) : (
          <KnowledgeList entries={entries} onDelete={handleDelete} />
        )}
      </div>

      <KnowledgeForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={fetchEntries}
      />
    </div>
  );
}
