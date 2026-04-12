"use client";

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

function ToolRenderer({ tool }: { tool: ToolBlock }) {
  const name = tool.name?.toLowerCase() || "";

  if (name === "read") return <ReadTool input={tool.input || {}} output={tool.output} duration={tool.duration} />;
  if (name === "edit") return <EditTool input={tool.input || {}} duration={tool.duration} />;
  if (name === "write") return <WriteTool input={tool.input || {}} duration={tool.duration} />;
  if (name === "bash") return <BashTool input={tool.input || {}} output={tool.output} duration={tool.duration} />;
  if (name === "grep" || name === "glob") return <GrepTool input={tool.input || {}} output={tool.output} duration={tool.duration} />;

  return <GenericTool toolName={tool.name} input={tool.input || {}} output={tool.output} duration={tool.duration} />;
}

export function ToolUseBlock({ tools }: { tools: ToolBlock[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="mt-1.5 max-w-[80%] space-y-1.5">
      {tools.map((tool, i) => (
        <ToolRenderer key={i} tool={tool} />
      ))}
    </div>
  );
}
