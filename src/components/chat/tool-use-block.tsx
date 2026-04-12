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
    <div className="bg-neutral-950 border border-neutral-800 rounded-md mt-1.5 overflow-hidden max-w-[80%]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 text-xs text-neutral-500 text-left hover:text-neutral-300 flex justify-between items-center"
      >
        <span>{tools.length} tool call{tools.length !== 1 ? "s" : ""}</span>
        <span>{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded &&
        tools.map((tool, i) => (
          <div
            key={i}
            className="px-3 py-2 border-t border-neutral-800 text-xs flex justify-between items-center"
          >
            <span className="text-neutral-400">
              {tool.name}{" "}
              {tool.input?.file_path && (
                <span className="text-neutral-600 font-mono">
                  {tool.input.file_path}
                </span>
              )}
              {tool.input?.command && (
                <span className="text-neutral-600 font-mono">
                  {tool.input.command}
                </span>
              )}
            </span>
          </div>
        ))}
    </div>
  );
}
