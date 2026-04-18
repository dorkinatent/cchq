"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { StreamState, ActiveTool } from "@/hooks/use-session-stream";

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  return <span className="tabular-nums">{elapsed}s</span>;
}

const THINKING_VERBS = [
  "Thinking", "Pondering", "Considering", "Reasoning", "Musing", "Reflecting",
  "Cogitating", "Ruminating", "Deliberating", "Contemplating", "Weighing",
  "Puzzling", "Wondering", "Plotting", "Brewing",
];

const PROCESSING_VERBS = [
  "Processing", "Churning", "Working", "Crunching", "Computing",
  "Synthesizing", "Assembling", "Crafting", "Constructing", "Building",
  "Wrangling", "Weaving", "Forging", "Cooking", "Distilling",
];

function RotatingVerb({ verbs }: { verbs: string[] }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * verbs.length));
  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % verbs.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [verbs.length]);
  return <span>{verbs[index]}</span>;
}

function ToolIcon({ done }: { done: boolean }) {
  if (!done) {
    return (
      <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
    );
  }
  return <span className="text-[var(--active-text)] text-xs shrink-0">✓</span>;
}

function ToolArgPreview({ tool }: { tool: ActiveTool }) {
  const input = tool.input || {};
  const name = tool.toolName.toLowerCase();

  if ((name === "read" || name === "edit" || name === "write") && input.file_path) {
    return <span className="text-[var(--text-muted)] font-mono">{String(input.file_path)}</span>;
  }
  if (name === "bash" && input.command) {
    const cmd = String(input.command);
    return (
      <span className="text-[var(--text-muted)] font-mono truncate max-w-[400px] inline-block align-bottom">
        {cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd}
      </span>
    );
  }
  if ((name === "grep" || name === "glob") && input.pattern) {
    return (
      <span className="text-[var(--text-muted)] font-mono">
        {String(input.pattern)}
        {input.path ? ` in ${String(input.path)}` : ""}
      </span>
    );
  }
  if (name === "agent" && input.description) {
    return <span className="text-[var(--text-muted)]">{String(input.description)}</span>;
  }

  const firstVal = Object.values(input).find((v) => typeof v === "string");
  if (firstVal) {
    const s = String(firstVal);
    return <span className="text-[var(--text-muted)] font-mono truncate max-w-[300px] inline-block align-bottom">{s.length > 60 ? s.slice(0, 57) + "..." : s}</span>;
  }
  return null;
}

function ActivityLine({ tool, isChild }: { tool: ActiveTool; isChild?: boolean }) {
  return (
    <div className={`flex items-start gap-2 py-0.5 ${isChild ? "ml-4" : ""}`}>
      {isChild && (
        <span className="text-[var(--border)] mt-1 shrink-0">└</span>
      )}
      <div className="mt-0.5 shrink-0">
        <ToolIcon done={tool.done} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--accent)] font-medium">{tool.toolName}</span>
          <span className="text-[var(--text-muted)]">(</span>
          <ToolArgPreview tool={tool} />
          <span className="text-[var(--text-muted)]">)</span>
        </div>
        {!tool.done && (
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
            Running... <ElapsedTimer startedAt={tool.startedAt} />
          </div>
        )}
      </div>
    </div>
  );
}

function buildToolSummary(tools: ActiveTool[]): string {
  const counts: Record<string, number> = {};
  for (const t of tools) {
    const name = t.toolName || "Unknown";
    counts[name] = (counts[name] || 0) + 1;
  }
  const parts: string[] = [];
  for (const [name, count] of Object.entries(counts)) {
    const n = name.toLowerCase();
    if (n === "read") parts.push(`Read ${count} file${count > 1 ? "s" : ""}`);
    else if (n === "edit") parts.push(`Edited ${count} file${count > 1 ? "s" : ""}`);
    else if (n === "write") parts.push(`Wrote ${count} file${count > 1 ? "s" : ""}`);
    else if (n === "bash") parts.push(`Ran ${count} command${count > 1 ? "s" : ""}`);
    else if (n === "grep") parts.push(`Searched ${count} time${count > 1 ? "s" : ""}`);
    else if (n === "glob") parts.push(`Globbed ${count} time${count > 1 ? "s" : ""}`);
    else if (n === "agent") parts.push(`Agent ×${count}`);
    else parts.push(`${name} ×${count}`);
  }
  return parts.join(", ");
}

export function StreamingIndicator({ state }: { state: StreamState }) {
  if (state.phase === "idle") return null;

  const hasTools = state.activeTools.length > 0;
  const doneCount = state.activeTools.filter((t) => t.done).length;
  const totalCount = state.activeTools.length;
  const allDone = hasTools && doneCount === totalCount;

  // Thinking dots shared between phases
  const thinkingDots = (
    <span className="flex gap-1" aria-hidden>
      <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full thinking-dot" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full thinking-dot" style={{ animationDelay: "200ms" }} />
      <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full thinking-dot" style={{ animationDelay: "400ms" }} />
    </span>
  );

  return (
    <div className="mb-5">
      <div className="text-[11px] text-[var(--text-muted)] mb-1">Claude</div>
      <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg overflow-hidden max-w-[min(96%,720px)]">

        {/* Collapsible activity tree — collapsed by default so streaming
            tool calls don't flood the chat. Users can expand to watch live. */}
        {hasTools && (
          <details className="group">
            <summary className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface)] transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span className="text-[var(--text-muted)] text-xs shrink-0 transition-transform group-open:rotate-90">
                ▶
              </span>
              {!allDone && (
                <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              <span className="text-xs text-[var(--text-secondary)]">
                {totalCount} tool call{totalCount > 1 ? "s" : ""}
                {doneCount > 0 ? ` (${doneCount} done)` : ""}
                {" — "}
                {buildToolSummary(state.activeTools)}
              </span>
            </summary>
            <div className="border-t border-[var(--border)] px-4 py-2.5 space-y-0.5">
              {state.activeTools.map((tool) => (
                <ActivityLine key={tool.toolUseId} tool={tool} />
              ))}
            </div>
          </details>
        )}

        {/* Status / streaming text */}
        {state.phase === "thinking" && (
          <div className={`px-4 py-2.5 ${hasTools ? "border-t border-[var(--border)]" : ""}`}>
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              {thinkingDots}
              <span><RotatingVerb verbs={THINKING_VERBS} />...</span>
              {state.thinkingStartedAt && (
                <span className="text-[var(--text-muted)]">
                  <ElapsedTimer startedAt={state.thinkingStartedAt} />
                </span>
              )}
            </div>
          </div>
        )}

        {state.phase === "tool_use" && (
          <div className="px-4 py-2.5 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              {thinkingDots}
              <span><RotatingVerb verbs={PROCESSING_VERBS} />...</span>
            </div>
          </div>
        )}

        {/* Show streaming text whenever we have any, regardless of phase —
            Claude often alternates between text and tool calls in the same turn */}
        {state.streamingText && state.phase !== "error" && (
          <div className={`px-4 py-2.5 ${hasTools ? "border-t border-[var(--border)]" : ""}`}>
            <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--accent)] prose-strong:text-[var(--text-primary)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {state.streamingText}
              </ReactMarkdown>
              <span className="inline-block w-[2px] h-4 bg-[var(--accent)] caret-blink ml-0.5 align-text-bottom" aria-hidden />
            </div>
          </div>
        )}

        {state.phase === "error" && (
          <div className={`px-4 py-2.5 ${hasTools ? "border-t border-[var(--border)]" : ""}`}>
            <div className="text-xs text-[var(--errored-text)]">
              Error: {state.error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
