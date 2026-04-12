"use client";

import { useState } from "react";

type ToolBlock = {
  name: string;
  input?: any;
};

export function ToolUseBlock({ tools }: { tools: ToolBlock[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md mt-1.5 overflow-hidden max-w-[80%]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 text-xs text-[var(--text-muted)] text-left hover:text-[var(--text-secondary)] flex justify-between items-center"
      >
        <span>{tools.length} tool call{tools.length !== 1 ? "s" : ""}</span>
        <span>{expanded ? "\u25b2" : "\u25bc"}</span>
      </button>
      {expanded &&
        tools.map((tool, i) => (
          <div
            key={i}
            className="px-3 py-2 border-t border-[var(--border)] text-xs flex justify-between items-center"
          >
            <span className="text-[var(--text-secondary)]">
              {tool.name}{" "}
              {tool.input?.file_path && (
                <span className="text-[var(--text-muted)] font-mono">
                  {tool.input.file_path}
                </span>
              )}
              {tool.input?.command && (
                <span className="text-[var(--text-muted)] font-mono">
                  {tool.input.command}
                </span>
              )}
            </span>
          </div>
        ))}
    </div>
  );
}
