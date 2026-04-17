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
      <div className="py-24 max-w-md mx-auto text-center">
        <div className="eyebrow text-[var(--text-muted)] mb-3">Nothing remembered yet</div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          When you end a session, useful bits — decisions, facts, context — land here automatically.
        </p>
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
