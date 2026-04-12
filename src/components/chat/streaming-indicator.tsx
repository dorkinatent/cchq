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
  return <span className="text-[var(--text-muted)] tabular-nums">{elapsed}s</span>;
}

function ToolIndicator({ tool }: { tool: ActiveTool }) {
  const label =
    tool.input?.file_path?.toString() ||
    tool.input?.command?.toString() ||
    tool.input?.pattern?.toString() ||
    "";

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-1">
      {!tool.done ? (
        <span className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      ) : (
        <span className="text-[var(--active-text)]">&#10003;</span>
      )}
      <span className="text-[var(--accent)] font-medium">{tool.toolName}</span>
      {label && <span className="text-[var(--text-muted)] font-mono truncate max-w-[300px]">{label}</span>}
      <ElapsedTimer startedAt={tool.startedAt} />
    </div>
  );
}

export function StreamingIndicator({ state }: { state: StreamState }) {
  if (state.phase === "idle") return null;

  return (
    <div className="mb-5">
      <div className="text-[11px] text-[var(--text-muted)] mb-1">Claude</div>
      <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm max-w-[80%]">
        {state.phase === "thinking" && (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            <span>Thinking...</span>
            {state.thinkingStartedAt && <ElapsedTimer startedAt={state.thinkingStartedAt} />}
          </div>
        )}

        {state.phase === "tool_use" && (
          <div>
            {state.activeTools.map((tool) => (
              <ToolIndicator key={tool.toolUseId} tool={tool} />
            ))}
          </div>
        )}

        {state.phase === "streaming" && (
          <div>
            {state.activeTools.length > 0 && (
              <div className="mb-2 pb-2 border-b border-[var(--border)]">
                {state.activeTools.map((tool) => (
                  <ToolIndicator key={tool.toolUseId} tool={tool} />
                ))}
              </div>
            )}
            <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--accent)] prose-strong:text-[var(--text-primary)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {state.streamingText}
              </ReactMarkdown>
              <span className="inline-block w-2 h-4 bg-[var(--accent)] animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        {state.phase === "error" && (
          <div className="text-[var(--errored-text)]">
            Error: {state.error}
          </div>
        )}
      </div>
    </div>
  );
}
