"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useSessionMessages } from "@/hooks/use-session-messages";
import { useSessionStream } from "@/hooks/use-session-stream";
import { MessageList } from "@/components/chat/message-list";
import { MessageInput, type Attachment } from "@/components/chat/message-input";
import { SessionContextPanel } from "@/components/chat/session-context-panel";

type SessionDetail = {
  id: string;
  name: string;
  status: string;
  model: string;
  projectId: string;
  projectName?: string;
  projectPath?: string;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
};

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { messages, loading } = useSessionMessages(id);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [sending, setSending] = useState(false);

  const isActive = session?.status === "active";
  const streamState = useSessionStream(id, !!isActive);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then(setSession);
  }, [id]);

  // Refresh session details when a message completes (to get updated usage)
  useEffect(() => {
    if (streamState.completedMessage) {
      fetch(`/api/sessions/${id}`)
        .then((r) => r.json())
        .then(setSession);
    }
  }, [streamState.completedMessage, id]);

  const phaseLabel = {
    idle: null,
    thinking: "Thinking...",
    tool_use: "Using tools...",
    streaming: "Writing...",
    error: "Error",
  }[streamState.phase];

  async function handleSend(content: string, attachments?: Attachment[]) {
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, attachments }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Failed to send: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Failed to send: ${err.message}`);
    }
    setSending(false);
  }

  async function handleComplete() {
    await fetch(`/api/sessions/${id}/complete`, { method: "POST" });
    setSession((s) => (s ? { ...s, status: "completed" } : s));
  }

  async function handlePause() {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    setSession((s) => (s ? { ...s, status: "paused" } : s));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center px-6 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
            &larr; Back
          </Link>
          <span className="text-base font-semibold text-[var(--text-primary)]">
            {session?.name || "Loading..."}
          </span>
          {session && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${
                isActive
                  ? "bg-[var(--active-bg)] text-[var(--active-text)]"
                  : session.status === "paused"
                  ? "bg-[var(--paused-bg)] text-[var(--paused-text)]"
                  : "bg-[var(--completed-bg)] text-[var(--completed-text)]"
              }`}
            >
              {session.status}
            </span>
          )}
          {phaseLabel && (
            <span className="text-[11px] text-[var(--accent)] animate-pulse">
              {phaseLabel}
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center text-xs text-[var(--text-secondary)]">
          {session?.usage && (
            <span className="text-[var(--text-muted)] mr-2">
              {session.usage.totalTokens.toLocaleString()} tokens · ${session.usage.totalCostUsd.toFixed(4)}
            </span>
          )}
          {session?.model}
          {isActive && (
            <>
              <button
                onClick={handlePause}
                className="ml-3 px-2.5 py-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Pause
              </button>
              <button
                onClick={handleComplete}
                className="px-2.5 py-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Complete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
              Loading messages...
            </div>
          ) : (
            <MessageList messages={messages} streamState={streamState} />
          )}
          <MessageInput
            onSend={handleSend}
            disabled={!isActive || sending || streamState.phase !== "idle"}
          />
        </div>

        {session && (
          <SessionContextPanel
            sessionId={id}
            projectId={session.projectId}
            projectPath={session.projectPath || ""}
            model={session.model}
            messageCount={messages.length}
            usage={session.usage}
          />
        )}
      </div>
    </div>
  );
}
