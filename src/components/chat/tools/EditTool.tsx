"use client";

type Props = {
  input: { file_path?: string; old_string?: string; new_string?: string };
  duration?: number;
};

export function EditTool({ input, duration }: Props) {
  const filename = input.file_path?.split("/").pop() || "file";
  const dirPath = input.file_path?.split("/").slice(0, -1).join("/") || "";

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)]">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--text-muted)]">✏️</span>
          {dirPath && <span className="text-[var(--text-muted)]">{dirPath}/</span>}
          <span className="text-[var(--text-primary)] font-medium">{filename}</span>
        </div>
        {duration !== undefined && (
          <span className="text-[10px] text-[var(--text-muted)]">{duration}s</span>
        )}
      </div>
      <div className="px-3 py-2 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
        {input.old_string && (
          <div className="mb-2">
            {input.old_string.split("\n").map((line, i) => (
              <div key={`old-${i}`} className="text-[var(--errored-text)] opacity-70">
                <span className="select-none mr-2 text-[var(--errored-text)] opacity-50">-</span>
                {line}
              </div>
            ))}
          </div>
        )}
        {input.new_string && (
          <div>
            {input.new_string.split("\n").map((line, i) => (
              <div key={`new-${i}`} className="text-[var(--active-text)] opacity-80">
                <span className="select-none mr-2 text-[var(--active-text)] opacity-50">+</span>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
