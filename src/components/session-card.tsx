"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@/hooks/use-sessions";

const statusStyles = {
  active: { bg: "bg-green-950/50", text: "text-green-400", dot: "●" },
  paused: { bg: "bg-yellow-950/50", text: "text-yellow-400", dot: "◐" },
  completed: { bg: "bg-neutral-800", text: "text-neutral-400", dot: "○" },
  errored: { bg: "bg-red-950/50", text: "text-red-400", dot: "✕" },
};

export function SessionCard({ session }: { session: Session }) {
  const router = useRouter();
  const style = statusStyles[session.status];
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(session.name);

  async function handleRename() {
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setRenaming(false);
    setMenuOpen(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete session "${session.name}"? This cannot be undone.`)) return;
    await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    setMenuOpen(false);
  }

  return (
    <div
      className={`relative bg-neutral-900 border rounded-lg p-4 hover:border-blue-800/50 transition-colors ${
        session.status === "active" ? "border-blue-900/30" : "border-neutral-800"
      } ${session.status === "paused" ? "opacity-70" : ""}`}
    >
      <Link href={`/sessions/${session.id}`} className="block">
        <div className="flex justify-between items-center mb-2.5">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRename();
              }}
              onClick={(e) => e.preventDefault()}
              className="flex gap-2 flex-1 mr-2"
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white"
                autoFocus
                onBlur={() => {
                  setRenaming(false);
                  setNewName(session.name);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setRenaming(false);
                    setNewName(session.name);
                  }
                }}
              />
            </form>
          ) : (
            <span className="text-sm font-medium text-white truncate mr-2">
              {session.name}
            </span>
          )}
          <span className={`text-[11px] ${style.bg} ${style.text} px-2 py-0.5 rounded-full shrink-0`}>
            {style.dot} {session.status}
          </span>
        </div>
        <div className="text-xs text-neutral-500 mb-2">
          {session.project_name || "Unknown project"} &middot; {session.model}
        </div>
        {session.last_message && (
          <div className="text-[13px] text-neutral-400 line-clamp-2 mb-3 leading-relaxed">
            {session.last_message}
          </div>
        )}
        <div className="flex justify-between items-center text-[11px] text-neutral-600">
          <span>{session.message_count || 0} messages</span>
          <span>{new Date(session.updated_at).toLocaleString()}</span>
        </div>
      </Link>

      {/* Menu button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        }}
        className="absolute top-3 right-3 text-neutral-600 hover:text-neutral-300 text-sm px-1.5 py-0.5 rounded hover:bg-neutral-800"
      >
        ···
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-10 right-3 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg z-20 py-1 min-w-[120px]">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setRenaming(true);
                setMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700"
            >
              Rename
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete();
              }}
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
