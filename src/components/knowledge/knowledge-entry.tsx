type KnowledgeEntryData = {
  id: string;
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
  createdAt: string;
  sessionId: string | null;
};

const typeStyles = {
  decision: { bg: "bg-blue-950/30", text: "text-blue-400" },
  fact: { bg: "bg-green-950/30", text: "text-green-400" },
  context: { bg: "bg-yellow-950/30", text: "text-yellow-400" },
  summary: { bg: "bg-neutral-800", text: "text-neutral-400" },
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
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[11px] ${style.bg} ${style.text} px-2 py-0.5 rounded-full`}>
          {entry.type}
        </span>
        <div className="flex gap-2 items-center">
          <span className="text-[11px] text-neutral-600">
            {new Date(entry.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={() => onDelete(entry.id)}
            className="text-neutral-600 hover:text-red-400 text-xs"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="text-sm text-neutral-300 leading-relaxed mb-2">{entry.content}</p>
      {entry.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
