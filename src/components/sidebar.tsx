"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white"
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
          isActive ? "bg-blue-950/50 text-blue-300" : "text-neutral-400 hover:text-neutral-200"
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
        className="absolute right-1 top-1.5 text-neutral-600 hover:text-neutral-300 text-xs opacity-0 group-hover:opacity-100 px-1"
      >
        ···
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-7 right-0 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg z-20 py-1 min-w-[120px]">
            <button
              onClick={() => {
                setRenaming(true);
                setMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700"
            >
              Rename
            </button>
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-neutral-700"
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
    <aside className="w-52 border-r border-neutral-800 bg-neutral-950 flex flex-col p-4 shrink-0">
      <Link href="/" className="text-lg font-semibold text-white mb-1">
        CCUI
      </Link>
      <span className="text-xs text-neutral-500 mb-6">Claude Code Dashboard</span>

      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">
        Projects
      </div>
      <Link
        href="/"
        className={`px-2.5 py-1.5 rounded text-sm mb-0.5 ${
          pathname === "/" ? "bg-blue-950/50 text-blue-300" : "text-neutral-400 hover:text-neutral-200"
        }`}
      >
        All Sessions
      </Link>
      {projects.map((p) => (
        <ProjectItem key={p.id} project={p} isActive={false} />
      ))}

      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-6 mb-2">
        Memory
      </div>
      <Link
        href="/knowledge"
        className={`px-2.5 py-1.5 rounded text-sm ${
          pathname === "/knowledge" ? "bg-blue-950/50 text-blue-300" : "text-neutral-400 hover:text-neutral-200"
        }`}
      >
        Knowledge Base
      </Link>
    </aside>
  );
}
