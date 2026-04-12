"use client";

import { useState } from "react";

export type PermissionRequest = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  /** Multiple parallel tool calls can be batched */
  batch?: { toolName: string; input: Record<string, unknown> }[];
};

export type PermissionResponse = {
  requestId: string;
  decision: "allow" | "deny";
  /** Create a project rule to auto-allow this pattern */
  createRule?: boolean;
  /** User feedback on why they denied */
  reason?: string;
  /** User's suggested alternative action */
  alternative?: string;
};

// Tool chips are the visual accent — a small mono pill bearing the tool
// name. No emoji (they read as chat-app cheer, wrong for this brand).
function ToolChip({ name }: { name: string }) {
  return (
    <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--accent)] border border-[var(--accent)]/40 bg-[var(--bg)] rounded px-1.5 py-[1px] leading-none">
      {name}
    </span>
  );
}

function ToolPreview({ toolName: _toolName, input }: { toolName: string; input: Record<string, unknown> }) {
  return (
    <div className="bg-[var(--bg)] rounded-md p-3 text-xs font-mono">
      {input.file_path ? (
        <div className="text-[var(--text-secondary)]">{String(input.file_path)}</div>
      ) : null}
      {input.command ? (
        <div className="text-[var(--text-secondary)]">
          <span className="text-[var(--text-muted)]">$ </span>
          {String(input.command)}
        </div>
      ) : null}
      {input.pattern ? (
        <div className="text-[var(--text-secondary)]">/{String(input.pattern)}/</div>
      ) : null}
      {input.old_string && input.new_string ? (
        <div className="space-y-1 mt-1">
          <div className="text-[var(--errored-text)] line-through opacity-70 truncate">
            {String(input.old_string).slice(0, 120)}
          </div>
          <div className="text-[var(--active-text)] truncate">
            {String(input.new_string).slice(0, 120)}
          </div>
        </div>
      ) : null}
      {input.content && !input.old_string ? (
        <div className="text-[var(--text-muted)] truncate">
          {String(input.content).slice(0, 200)}
        </div>
      ) : null}
    </div>
  );
}

export function PermissionCard({
  request,
  onRespond,
}: {
  request: PermissionRequest;
  onRespond: (response: PermissionResponse) => void;
}) {
  const [showDenyForm, setShowDenyForm] = useState(false);
  const [showAlternative, setShowAlternative] = useState(false);
  const [reason, setReason] = useState("");
  const [alternative, setAlternative] = useState("");
  const [showBatchDetail, setShowBatchDetail] = useState(false);

  const isBatch = request.batch && request.batch.length > 1;

  function handleAllow() {
    onRespond({ requestId: request.id, decision: "allow" });
  }

  function handleAllowAll() {
    onRespond({ requestId: request.id, decision: "allow", createRule: true });
  }

  function handleDeny() {
    onRespond({
      requestId: request.id,
      decision: "deny",
      reason: reason || undefined,
      alternative: alternative || undefined,
    });
    setShowDenyForm(false);
  }

  return (
    <div className="mb-5">
      <div className="eyebrow mb-1.5">Permission request</div>
      <div className="bg-[var(--surface-raised)] border-2 border-[var(--paused-bg)] rounded-lg px-4 py-3 max-w-[80%]">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <ToolChip name={request.toolName} />
          <span className="text-sm text-[var(--text-primary)]">
            Claude wants to {request.toolName.toLowerCase()}
            {(request.input.file_path || request.input.command) ? " " : null}
            {request.input.file_path ? (
              <span className="font-mono text-[var(--accent)]">
                {String(request.input.file_path)}
              </span>
            ) : null}
            {request.input.command ? (
              <span className="font-mono text-[var(--accent)]">
                {String(request.input.command).slice(0, 60)}
              </span>
            ) : null}
          </span>
        </div>

        {/* Batch indicator */}
        {isBatch && (
          <div className="mb-3">
            <button
              onClick={() => setShowBatchDetail(!showBatchDetail)}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              {request.batch!.length} tool calls — {showBatchDetail ? "Hide details" : "Review individually"}
            </button>
            {showBatchDetail && (
              <div className="mt-2 space-y-1.5">
                {request.batch!.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <ToolChip name={item.toolName} />
                    {item.input.file_path ? (
                      <span className="font-mono text-[var(--text-muted)] truncate">
                        {String(item.input.file_path)}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        {!isBatch && <ToolPreview toolName={request.toolName} input={request.input} />}

        {/* Deny form */}
        {showDenyForm && (
          <div className="mt-3 space-y-2">
            <div>
              <label className="text-[11px] text-[var(--text-muted)]">Why? (optional)</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] mt-0.5"
                placeholder="e.g. don't delete that, it's still needed"
              />
            </div>
            {showAlternative ? (
              <div>
                <label className="text-[11px] text-[var(--text-muted)]">Instead, do...</label>
                <input
                  value={alternative}
                  onChange={(e) => setAlternative(e.target.value)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] mt-0.5"
                  placeholder="e.g. use rm -rf dist/old/ instead"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowAlternative(true)}
                className="text-[11px] text-[var(--accent)] hover:underline"
              >
                + Suggest alternative
              </button>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleDeny}
                className="px-3 py-1.5 bg-[var(--errored-bg)] text-[var(--errored-text)] text-xs rounded hover:opacity-90"
              >
                Deny
              </button>
              <button
                onClick={() => setShowDenyForm(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!showDenyForm && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={handleAllow}
              className="px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] text-xs rounded hover:bg-[var(--accent-hover)]"
            >
              {isBatch ? "Allow All" : "Allow"}
            </button>
            <button
              onClick={handleAllowAll}
              className="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-secondary)] rounded hover:text-[var(--text-primary)]"
            >
              Allow all like this
            </button>
            <button
              onClick={() => setShowDenyForm(true)}
              className="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-secondary)] rounded hover:text-[var(--errored-text)]"
            >
              Deny
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
