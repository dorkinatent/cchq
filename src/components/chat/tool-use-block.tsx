"use client";

import { useState } from "react";
import { ReadTool } from "./tools/ReadTool";
import { EditTool } from "./tools/EditTool";
import { WriteTool } from "./tools/WriteTool";
import { BashTool } from "./tools/BashTool";
import { GrepTool } from "./tools/GrepTool";
import { GenericTool } from "./tools/GenericTool";

type ToolBlock = {
  name: string;
  input?: any;
  output?: any;
  duration?: number;
};

function ToolArgPreview({ tool }: { tool: ToolBlock }) {
  const name = tool.name?.toLowerCase() || "";
  const input = tool.input || {};

  if ((name === "read" || name === "edit" || name === "write") && input.file_path) {
    return <span className="text-[var(--text-muted)] font-mono">{String(input.file_path)}</span>;
  }
  if (name === "bash" && input.command) {
    const cmd = String(input.command);
    return <span className="text-[var(--text-muted)] font-mono">{cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd}</span>;
  }
  if ((name === "grep" || name === "glob") && input.pattern) {
    return <span className="text-[var(--text-muted)] font-mono">{String(input.pattern)}</span>;
  }
  if (name === "agent" && input.description) {
    return <span className="text-[var(--text-muted)]">{String(input.description)}</span>;
  }
  return null;
}

function ToolRenderer({ tool }: { tool: ToolBlock }) {
  const name = tool.name?.toLowerCase() || "";

  if (name === "read") return <ReadTool input={tool.input || {}} output={tool.output} duration={tool.duration} />;
  if (name === "edit") return <EditTool input={tool.input || {}} duration={tool.duration} />;
  if (name === "write") return <WriteTool input={tool.input || {}} duration={tool.duration} />;
  if (name === "bash") return <BashTool input={tool.input || {}} output={tool.output} duration={tool.duration} />;
  if (name === "grep" || name === "glob") return <GrepTool input={tool.input || {}} output={tool.output} duration={tool.duration} />;

  return <GenericTool toolName={tool.name} input={tool.input || {}} output={tool.output} duration={tool.duration} />;
}

function ToolSummaryLine({ tool }: { tool: ToolBlock }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs">
      <span className="text-[var(--active-text)] shrink-0">✓</span>
      <span className="text-[var(--accent)] font-medium">{tool.name}</span>
      <span className="text-[var(--text-muted)]">(</span>
      <ToolArgPreview tool={tool} />
      <span className="text-[var(--text-muted)]">)</span>
    </div>
  );
}

export function ToolUseBlock({ tools }: { tools: ToolBlock[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  // Build summary: "Read 2 files, Edited 1 file, Ran 1 command"
  const counts: Record<string, number> = {};
  for (const t of tools) {
    const name = t.name || "Unknown";
    counts[name] = (counts[name] || 0) + 1;
  }
  const summaryParts = Object.entries(counts).map(([name, count]) => {
    const n = name.toLowerCase();
    if (n === "read") return `Read ${count} file${count > 1 ? "s" : ""}`;
    if (n === "edit") return `Edited ${count} file${count > 1 ? "s" : ""}`;
    if (n === "write") return `Wrote ${count} file${count > 1 ? "s" : ""}`;
    if (n === "bash") return `Ran ${count} command${count > 1 ? "s" : ""}`;
    if (n === "grep") return `Searched ${count} time${count > 1 ? "s" : ""}`;
    if (n === "glob") return `Globbed ${count} time${count > 1 ? "s" : ""}`;
    return `${name} ×${count}`;
  });

  return (
    <div className="mt-1.5 max-w-[80%]">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
        {/* Compact summary header — always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface)] transition-colors"
        >
          <span className="text-[var(--text-muted)] text-xs shrink-0 transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
            ▶
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            {tools.length} tool call{tools.length > 1 ? "s" : ""} — {summaryParts.join(", ")}
          </span>
        </button>

        {/* Expanded: show activity tree + detailed views */}
        {expanded && (
          <div className="border-t border-[var(--border)]">
            {/* Activity tree lines */}
            <div className="px-3 py-2 space-y-0.5 border-b border-[var(--border)]">
              {tools.map((tool, i) => (
                <ToolSummaryLine key={i} tool={tool} />
              ))}
            </div>

            {/* Detailed tool renderers */}
            <div className="p-2 space-y-1.5">
              {tools.map((tool, i) => (
                <ToolRenderer key={i} tool={tool} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
