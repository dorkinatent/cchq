"use client";

type Props = {
  input: { file_path?: string; content?: string };
  duration?: number;
};

export function WriteTool({ input, duration }: Props) {
  const filename = input.file_path?.split("/").pop() || "file";
  const dirPath = input.file_path?.split("/").slice(0, -1).join("/") || "";

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)]">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--text-muted)]">📝</span>
          {dirPath && <span className="text-[var(--text-muted)]">{dirPath}/</span>}
          <span className="text-[var(--text-primary)] font-medium">{filename}</span>
          <span className="text-[9px] bg-[var(--active-bg)] text-[var(--active-text)] px-1.5 py-0.5 rounded font-sans">NEW</span>
        </div>
        {duration !== undefined && (
          <span className="text-[10px] text-[var(--text-muted)]">{duration}s</span>
        )}
      </div>
      {input.content && (
        <pre className="px-3 py-2 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
          {input.content.length > 1500 ? input.content.slice(0, 1500) + "\n... (truncated)" : input.content}
        </pre>
      )}
    </div>
  );
}
