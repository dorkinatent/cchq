"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@/hooks/use-sessions";
import { relativeTime } from "@/lib/relative-time";

const statusStyles = {
  active: { bg: "bg-[var(--active-bg)]", text: "text-[var(--active-text)]", dot: "\u25cf" },
  paused: { bg: "bg-[var(--paused-bg)]", text: "text-[var(--paused-text)]", dot: "\u25d0" },
  completed: { bg: "bg-[var(--completed-bg)]", text: "text-[var(--completed-text)]", dot: "\u25cb" },
  errored: { bg: "bg-[var(--errored-bg)]", text: "text-[var(--errored-text)]", dot: "\u2715" },
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
      className={`relative bg-[var(--surface-raised)] border rounded-lg p-4 hover:border-[var(--accent)] transition-colors ${
        session.status === "active" ? "border-[var(--accent)]" : "border-[var(--border)]"
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
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
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
            <span className="text-sm font-medium text-[var(--text-primary)] truncate mr-2">
              {session.name}
            </span>
          )}
          <span className={`text-[11px] ${style.bg} ${style.text} px-2 py-0.5 rounded-full shrink-0 mr-8`}>
            {style.dot} {session.status}
          </span>
        </div>
        <div className="text-xs text-[var(--text-secondary)] mb-2">
          {session.project_name || "Unknown project"} &middot; {session.model}
        </div>
        {session.last_message && (
          <div className="text-[13px] text-[var(--text-secondary)] line-clamp-2 mb-3 leading-relaxed">
            {session.last_message}
          </div>
        )}
        <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)]">
          <span>
            {session.message_count || 0} messages
            {session.usage && session.usage.totalTokens > 0 && (
              <>
                {" · "}
                {session.usage.totalTokens.toLocaleString()} tokens
                {" · $"}
                {session.usage.totalCostUsd.toFixed(4)}
              </>
            )}
          </span>
          {session.status === "paused" ? (
            <span className="text-[var(--paused-text)]">
              Paused {relativeTime(session.updated_at)}
            </span>
          ) : (
            <span>{new Date(session.updated_at).toLocaleString()}</span>
          )}
        </div>
        {session.status === "paused" && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/sessions/${session.id}`);
            }}
            className="mt-3 w-full py-1.5 px-3 bg-[var(--accent)] text-white rounded text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Resume
          </button>
        )}
      </Link>

      {/* Menu button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        }}
        className="absolute top-2.5 right-2.5 z-10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-base font-bold leading-none px-2 py-1 rounded hover:bg-[var(--surface)] bg-[var(--surface-raised)]/60 border border-transparent hover:border-[var(--border)]"
        aria-label="Session actions"
        title="Rename or delete"
      >
        ···
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-10 right-3 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md shadow-lg z-20 py-1 min-w-[120px]">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setRenaming(true);
                setMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface)]"
            >
              Rename
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete();
              }}
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
