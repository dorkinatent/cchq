"use client";

import { useState } from "react";
import type { CommandResult, ModelInfo } from "@/types/command-result";

type ModelResult = Extract<CommandResult, { command: "model" }>;

export function ModelCard({
  result,
  sessionId,
  onSessionUpdate,
}: {
  result: ModelResult;
  sessionId: string;
  onSessionUpdate?: () => void;
}) {
  const [currentModel, setCurrentModel] = useState(result.data?.currentModel ?? "");
  const [switching, setSwitching] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const { availableModels, currentEffort } = result.data;

  async function handleSwitch(model: string) {
    if (model === currentModel || switching) return;
    setSwitching(model);
    setFeedback(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        setCurrentModel(model);
        setFeedback("Updated");
        onSessionUpdate?.();
        setTimeout(() => setFeedback(null), 2000);
      } else {
        setFeedback("Failed to update");
      }
    } catch {
      setFeedback("Failed to update");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="space-y-1">
        {availableModels.map((m) => (
          <button
            key={m.value}
            onClick={() => handleSwitch(m.value)}
            disabled={switching !== null}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              m.value === currentModel
                ? "bg-[var(--accent)]/10 text-[var(--text-primary)] font-medium"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            } ${switching === m.value ? "opacity-60" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px]">{m.displayName}</span>
              {m.value === currentModel && (
                <span className="text-[11px] text-[var(--accent)]">current</span>
              )}
              {switching === m.value && (
                <span className="text-[11px] text-[var(--text-muted)]">switching...</span>
              )}
            </div>
          </button>
        ))}
      </div>
      {currentEffort && (
        <div className="text-[12px] text-[var(--text-muted)] pt-1">
          Effort: <span className="text-[var(--text-secondary)]">{currentEffort}</span>
        </div>
      )}
      {feedback && (
        <div className="text-[11px] text-[var(--accent)] pt-0.5">{feedback}</div>
      )}
    </div>
  );
}
