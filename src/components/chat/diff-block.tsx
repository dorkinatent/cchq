"use client";

import type { DiffHunk } from "@/lib/git/diff-parser";

export function DiffBlock({ hunks }: { hunks: DiffHunk[] }) {
  if (hunks.length === 0) {
    return (
      <div className="text-[12px] text-[var(--text-muted)] py-3 px-4 font-mono">
        No diff content
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto text-[12px] leading-[1.6] font-mono"
      style={{ fontVariationSettings: '"CASL" 0, "MONO" 1, "slnt" 0' }}
    >
      {hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx}>
          {/* Hunk header */}
          <div className="px-4 py-1 text-[var(--text-muted)] bg-[color-mix(in_oklch,var(--surface-raised)_40%,transparent)] select-none">
            {hunk.header}
          </div>
          {/* Lines */}
          {hunk.lines.map((line, lineIdx) => {
            const bgClass =
              line.type === "add"
                ? "bg-[var(--active-bg)]"
                : line.type === "delete"
                  ? "bg-[var(--errored-bg)]"
                  : "";
            const textClass =
              line.type === "add"
                ? "text-[var(--active-text)]"
                : line.type === "delete"
                  ? "text-[var(--errored-text)]"
                  : "text-[var(--text-secondary)]";
            const prefix =
              line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";

            return (
              <div key={lineIdx} className={`flex ${bgClass}`}>
                <span className="w-10 shrink-0 text-right pr-1 text-[var(--text-muted)] select-none tabular-nums opacity-60">
                  {line.oldLineNo ?? ""}
                </span>
                <span className="w-10 shrink-0 text-right pr-2 text-[var(--text-muted)] select-none tabular-nums opacity-60">
                  {line.newLineNo ?? ""}
                </span>
                <span className={`w-4 shrink-0 text-center select-none ${textClass}`}>
                  {prefix}
                </span>
                <span className={`flex-1 pr-4 whitespace-pre ${textClass}`}>
                  {line.content}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function BinaryFilePlaceholder() {
  return (
    <div className="text-[12px] text-[var(--text-muted)] py-6 px-4 text-center font-mono">
      Binary file — not shown
    </div>
  );
}
