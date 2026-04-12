"use client";

type Props = {
  input: { pattern?: string; path?: string; glob?: string };
  output?: string;
  duration?: number;
};

export function GrepTool({ input, output, duration }: Props) {
  const files = output?.split("\n").filter(Boolean) || [];

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)]">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--text-muted)]">🔍</span>
          <span className="text-[var(--accent)] font-mono">{input.pattern}</span>
          {input.path && <span className="text-[var(--text-muted)]">in {input.path}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)]">{files.length} results</span>
          {duration !== undefined && (
            <span className="text-[10px] text-[var(--text-muted)]">{duration}s</span>
          )}
        </div>
      </div>
      {files.length > 0 && (
        <div className="px-3 py-2 text-xs font-mono text-[var(--text-secondary)] max-h-48 overflow-y-auto">
          {files.slice(0, 20).map((file, i) => (
            <div key={i} className="py-0.5 truncate">{file}</div>
          ))}
          {files.length > 20 && (
            <div className="text-[var(--text-muted)] mt-1">... and {files.length - 20} more</div>
          )}
        </div>
      )}
    </div>
  );
}
