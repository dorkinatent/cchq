"use client";

import { useState } from "react";

type Props = {
  input: { command?: string; description?: string };
  output?: string;
  duration?: number;
};

export function BashTool({ input, output, duration }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isLong = output && output.length > 500;
  const displayOutput = expanded ? output : output?.slice(0, 500);

  return (
    <div className="bg-[#0d0d0d] border border-[var(--border)] rounded-md overflow-hidden font-mono">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#151515] border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--text-muted)]">$</span>
          <span className="text-[#c8d6f0]">{input.command}</span>
        </div>
        {duration !== undefined && (
          <span className="text-[10px] text-[var(--text-muted)]">{duration}s</span>
        )}
      </div>
      {output && (
        <div className="px-3 py-2 text-xs text-[#a0b0c0] overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
          {displayOutput}
          {isLong && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="block mt-2 text-[var(--accent)] hover:underline text-[10px]"
            >
              Show full output ({output.length.toLocaleString()} chars)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
