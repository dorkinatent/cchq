"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Project = {
  id: string;
  name: string;
  path: string;
};

export function Sidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects);
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
        <Link
          key={p.id}
          href={`/?project=${p.id}`}
          className="px-2.5 py-1.5 rounded text-sm text-neutral-400 hover:text-neutral-200 mb-0.5"
        >
          {p.name}
        </Link>
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
