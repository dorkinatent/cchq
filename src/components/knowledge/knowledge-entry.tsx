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

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[11px] ${style.bg} ${style.text} px-2 py-0.5 rounded-full`}>
          {entry.type}
        </span>
        <div className="flex gap-2 items-center">
          <span className="text-[11px] text-[var(--text-muted)]">
            {new Date(entry.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={() => onDelete(entry.id)}
            className="text-[var(--text-muted)] hover:text-[var(--errored-text)] text-xs"
          >
            Delete
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
