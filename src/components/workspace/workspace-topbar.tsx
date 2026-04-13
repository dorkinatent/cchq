"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OverviewSession } from "@/app/api/sessions/overview/route";
import { useToast } from "@/components/ui/toast";

type SessionLite = {
  id: string;
  name: string;
  projectName?: string | null;
};

export function WorkspaceTopbar({
  openSessions,
  available,
  onAdd,
  atLimit,
  sessionIds,
  onSaved,
}: {
  openSessions: SessionLite[];
  available: OverviewSession[];
  onAdd: (id: string) => void;
  atLimit: boolean;
  sessionIds: string[];
  onSaved?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  useEffect(() => {
    if (!saveOpen) return;
    function onDown(e: MouseEvent) {
      if (!saveRef.current?.contains(e.target as Node)) setSaveOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [saveOpen]);

  useEffect(() => {
    if (saveOpen) {
      // Focus input on next frame so the element exists in DOM.
      const r = requestAnimationFrame(() => saveInputRef.current?.focus());
      return () => cancelAnimationFrame(r);
    }
  }, [saveOpen]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || sessionIds.length === 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, sessionIds }),
      });
      if (!res.ok) {
        toast("Could not save workspace", { variant: "error" });
        return;
      }
      toast("Workspace saved");
      setName("");
      setSaveOpen(false);
      onSaved?.();
    } catch {
      toast("Could not save workspace", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const namesStr = openSessions.map((s) => s.name).join(", ");

  return (
    <header className="flex items-center gap-4 px-6 py-3 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
      <div className="flex items-baseline gap-3 min-w-0 flex-1">
        <span className="eyebrow text-[var(--text-muted)]">Workspace</span>
        <span
          className="text-sm text-[var(--text-secondary)] truncate"
          title={namesStr}
        >
          {openSessions.length === 0
            ? "No sessions open"
            : openSessions.length === 1
            ? namesStr
            : `${openSessions.length} sessions · ${namesStr}`}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {sessionIds.length > 0 && (
          <div className="relative" ref={saveRef}>
            <button
              onClick={() => setSaveOpen((v) => !v)}
              className="px-2.5 py-1 text-[12px] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              Save as…
            </button>
            {saveOpen && (
              <div className="absolute right-0 mt-1 w-72 z-30 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] shadow-lg p-3">
                <label className="block eyebrow text-[var(--text-muted)] mb-1.5">
                  Workspace name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={saveInputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                      if (e.key === "Escape") setSaveOpen(false);
                    }}
                    placeholder="e.g. Monday triage"
                    className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!name.trim() || saving}
                    className="px-3 py-1 text-[12px] rounded bg-[var(--accent)] text-[var(--bg)] font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                  {sessionIds.length} session{sessionIds.length === 1 ? "" : "s"} will be saved.
                </div>
              </div>
            )}
          </div>
        )}
        {!atLimit && (
          <div className="relative" ref={wrapRef}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="px-2.5 py-1 text-[12px] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0"
            >
              + Add session
            </button>
            {pickerOpen && (
              <div className="absolute right-0 mt-1 w-80 max-h-[60vh] overflow-y-auto z-30 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] shadow-lg">
                {available.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-[var(--text-muted)]">
                    No other sessions available.
                  </div>
                ) : (
                  <ul className="py-1">
                    {available.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => {
                            onAdd(s.id);
                            setPickerOpen(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface)] flex items-center gap-2"
                        >
                          <span className="text-[var(--text-primary)] truncate flex-1">
                            {s.name}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[14ch]">
                            {s.project_name ?? "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        {atLimit && (
          <span className="text-[11px] text-[var(--text-muted)]">
            6-column limit reached
          </span>
        )}
        <Link
          href="/"
          className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--surface-raised)]"
        >
          ← Back to dashboard
        </Link>
      </div>
    </header>
  );
}
