"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ThemeSwitcher } from "./theme-switcher";

type Project = {
  id: string;
  name: string;
  path: string;
};

function ProjectItem({ project, isActive }: { project: Project; isActive: boolean }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(project.name);

  async function handleRename() {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setRenaming(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete project "${project.name}" and all its sessions? This cannot be undone.`)) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    setMenuOpen(false);
    router.push("/");
  }

  if (renaming) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleRename();
        }}
        className="mb-0.5"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
          autoFocus
          onBlur={() => {
            setRenaming(false);
            setNewName(project.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setRenaming(false);
              setNewName(project.name);
            }
          }}
        />
      </form>
    );
  }

  return (
    <div className="relative group mb-0.5">
      <Link
        href={`/?project=${project.id}`}
        className={`block px-2.5 py-1.5 rounded text-sm truncate pr-6 ${
          isActive ? "bg-[var(--surface-raised)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
        title={project.path}
      >
        {project.name}
      </Link>

      <button
        onClick={(e) => {
          e.preventDefault();
          setMenuOpen(!menuOpen);
        }}
        className="absolute right-1 top-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs opacity-0 group-hover:opacity-100 px-1"
      >
        ···
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-7 right-0 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md shadow-lg z-20 py-1 min-w-[120px]">
            <Link
              href={`/projects/${project.id}/settings`}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface)]"
            >
              Permissions
            </Link>
            <button
              onClick={() => {
                setRenaming(true);
                setMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface)]"
            >
              Rename
            </button>
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--errored-text)] hover:bg-[var(--surface)]"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    function fetchProjects() {
      fetch("/api/projects")
        .then((r) => r.json())
        .then(setProjects);
    }

    fetchProjects();

    const channel = supabase
      .channel("sidebar-projects")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => fetchProjects()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => fetchProjects()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <aside className="w-52 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col p-4 shrink-0">
      <Link href="/" className="text-lg font-semibold text-[var(--text-primary)] mb-1">
        CCUI
      </Link>
      <span className="text-xs text-[var(--text-secondary)] mb-6">Claude Code Dashboard</span>

      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-2">
        Projects
      </div>
      <Link
        href="/"
        className={`px-2.5 py-1.5 rounded text-sm mb-0.5 ${
          pathname === "/" ? "bg-[var(--surface-raised)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        All Sessions
      </Link>
      {projects.map((p) => (
        <ProjectItem key={p.id} project={p} isActive={false} />
      ))}

      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mt-6 mb-2">
        Memory
      </div>
      <Link
        href="/knowledge"
        className={`px-2.5 py-1.5 rounded text-sm ${
          pathname === "/knowledge" ? "bg-[var(--surface-raised)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        Knowledge Base
      </Link>

      <ThemeSwitcher />
    </aside>
  );
}
