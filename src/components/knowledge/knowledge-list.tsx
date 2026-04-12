"use client";

import { KnowledgeEntry } from "./knowledge-entry";

type Entry = {
  id: string;
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
  createdAt: string;
  sessionId: string | null;
};

export function KnowledgeList({
  entries,
  onDelete,
}: {
  entries: Entry[];
  onDelete: (id: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="text-[var(--text-secondary)] text-sm text-center py-20">
        No knowledge entries yet. They&apos;ll appear here as sessions are completed.
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry) => (
        <KnowledgeEntry key={entry.id} entry={entry} onDelete={onDelete} />
      ))}
    </div>
  );
}
