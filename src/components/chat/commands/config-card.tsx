"use client";

import { useState } from "react";
import type { CommandResult, ModelInfo } from "@/types/command-result";

type ConfigResult = Extract<CommandResult, { command: "config" }>;

const TRUST_OPTIONS = [
  { value: "full_auto", label: "Full Auto" },
  { value: "auto_log", label: "Auto + Log" },
  { value: "ask_me", label: "Ask Me" },
];

const EFFORT_OPTIONS = ["low", "medium", "high"];

export function ConfigCard({
  result,
  sessionId,
  onSessionUpdate,
}: {
  result: ConfigResult;
  sessionId: string;
  onSessionUpdate?: () => void;
}) {
  const [model, setModel] = useState(result.data?.model ?? "");
  const [effort, setEffort] = useState(result.data?.effort ?? "high");
  const [trustLevel, setTrustLevel] = useState(result.data?.trustLevel ?? "auto_log");
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const { availableModels } = result.data;

  async function updateField(field: string, value: string) {
    if (field === "model") {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/models`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: value }),
        });
        if (res.ok) {
          setModel(value);
          showFeedback(field, "\u2713");
          onSessionUpdate?.();
        } else {
          showFeedback(field, "Failed");
        }
      } catch {
        showFeedback(field, "Failed");
      }
      return;
    }

    const body: Record<string, string> = { [field]: value };
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (field === "effort") setEffort(value);
        if (field === "trustLevel") setTrustLevel(value);
        showFeedback(field, "\u2713");
        onSessionUpdate?.();
      } else {
        showFeedback(field, "Failed");
      }
    } catch {
      showFeedback(field, "Failed");
    }
  }

  function showFeedback(field: string, msg: string) {
    setFeedback((f) => ({ ...f, [field]: msg }));
    setTimeout(() => setFeedback((f) => {
      const next = { ...f };
      delete next[field];
      return next;
    }), 2000);
  }

  return (
    <div className="pt-1 space-y-3">
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center">
        <span className="eyebrow">Model</span>
        <select
          value={model}
          onChange={(e) => updateField("model", e.target.value)}
          className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1 text-[13px] text-[var(--text-primary)] font-mono"
        >
          {availableModels.map((m) => (
            <option key={m.value} value={m.value}>{m.displayName}</option>
          ))}
        </select>
        {feedback.model && (
          <span className="text-[11px] text-[var(--accent)]">{feedback.model}</span>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center">
        <span className="eyebrow">Effort</span>
        <div className="flex gap-1">
          {EFFORT_OPTIONS.map((e) => (
            <button
              key={e}
              onClick={() => updateField("effort", e)}
              className={`px-2.5 py-1 rounded text-[12px] transition-colors ${
                e === effort
                  ? "bg-[var(--accent)]/10 text-[var(--text-primary)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        {feedback.effort && (
          <span className="text-[11px] text-[var(--accent)]">{feedback.effort}</span>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center">
        <span className="eyebrow">Trust</span>
        <div className="flex gap-1">
          {TRUST_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => updateField("trustLevel", t.value)}
              className={`px-2.5 py-1 rounded text-[12px] transition-colors ${
                t.value === trustLevel
                  ? "bg-[var(--accent)]/10 text-[var(--text-primary)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {feedback.trustLevel && (
          <span className="text-[11px] text-[var(--accent)]">{feedback.trustLevel}</span>
        )}
      </div>
    </div>
  );
}
