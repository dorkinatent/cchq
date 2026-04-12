"use client";

type Props = {
  input: { file_path?: string; limit?: number; offset?: number };
  output?: string;
  duration?: number;
};

export function ReadTool({ input, output, duration }: Props) {
  const filename = input.file_path?.split("/").pop() || "file";
  const dirPath = input.file_path?.split("/").slice(0, -1).join("/") || "";

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)]">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--text-muted)]">📄</span>
          {dirPath && <span className="text-[var(--text-muted)]">{dirPath}/</span>}
          <span className="text-[var(--text-primary)] font-medium">{filename}</span>
          {input.offset && <span className="text-[var(--text-muted)]">:{input.offset}</span>}
        </div>
        {duration !== undefined && (
          <span className="text-[10px] text-[var(--text-muted)]">{duration}s</span>
        )}
      </div>
      {output && (
        <pre className="px-3 py-2 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
          {output.length > 2000 ? output.slice(0, 2000) + "\n... (truncated)" : output}
        </pre>
      )}
    </div>
  );
}
