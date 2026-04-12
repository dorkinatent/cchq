"use client";

import { useEffect, useState } from "react";

type KnowledgeEntryData = {
  id: string;
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
  createdAt: string;
  sessionId: string | null;
};

const typeStyles = {
  decision: { bg: "bg-[var(--paused-bg)]", text: "text-[var(--accent)]" },
  fact: { bg: "bg-[var(--active-bg)]", text: "text-[var(--active-text)]" },
  context: { bg: "bg-[var(--paused-bg)]", text: "text-[var(--paused-text)]" },
  summary: { bg: "bg-[var(--completed-bg)]", text: "text-[var(--completed-text)]" },
};

export function KnowledgeEntry({
  entry,
  onDelete,
}: {
  entry: KnowledgeEntryData;
  onDelete: (id: string) => void;
}) {
  const style = typeStyles[entry.type];
  const [confirming, setConfirming] = useState(false);

  // Revert pending confirm after 3s — no stuck buttons.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onDelete(entry.id);
  }

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[11px] font-medium ${style.bg} ${style.text} px-2 py-0.5 rounded-full`}>
          {entry.type}
        </span>
        <div className="flex gap-3 items-center">
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {new Date(entry.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={handleClick}
            className={`text-[11px] transition-colors ${
              confirming
                ? "text-[var(--errored-text)] font-medium"
                : "text-[var(--text-muted)] hover:text-[var(--errored-text)]"
            }`}
            aria-label={confirming ? "Confirm delete" : "Delete this entry"}
          >
            {confirming ? "Click again to delete" : "Delete"}
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">{entry.content}</p>
      {entry.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] bg-[var(--surface)] text-[var(--text-muted)] px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
