"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { SessionContextPanel, type MainOverlay } from "./session-context-panel";

/**
 * Mobile-only slide-in sheet for the session context panel.
 * Opens from the right, fills most of the screen width.
 */
export function MobileContextSheet({
  open,
  onClose,
  sessionId,
  sessionStatus,
  startSha,
  endSha,
  projectId,
  projectPath,
  model,
  effort,
  messageCount,
  usage,
  onExpandToMain,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionStatus: string;
  startSha?: string | null;
  endSha?: string | null;
  projectId: string;
  projectPath: string;
  model: string;
  effort?: string;
  messageCount: number;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  onExpandToMain?: (payload: MainOverlay) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 backdrop-themed"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="absolute top-0 right-0 bottom-0 w-[320px] max-w-[90vw] bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: "mobile-context-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both" }}
      >
        {/* Close bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] shrink-0">
          <span className="eyebrow">Session info</span>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Render the actual context panel — it uses its own internal tabs */}
        <div className="flex-1 overflow-hidden">
          <SessionContextPanel
            sessionId={sessionId}
            sessionStatus={sessionStatus}
            startSha={startSha}
            endSha={endSha}
            projectId={projectId}
            projectPath={projectPath}
            model={model}
            effort={effort}
            messageCount={messageCount}
            usage={usage}
            onExpandToMain={(payload) => {
              onClose();
              onExpandToMain?.(payload);
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
