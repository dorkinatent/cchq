"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useSessionMessages } from "@/hooks/use-session-messages";
import { MessageList } from "@/components/chat/message-list";
import { MessageInput } from "@/components/chat/message-input";
import { SessionContextPanel } from "@/components/chat/session-context-panel";

type SessionDetail = {
  id: string;
  name: string;
  status: string;
  model: string;
  projectId: string;
  projectName?: string;
  projectPath?: string;
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

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then(setSession);
  }, [id]);

  async function handleSend(content: string) {
    setSending(true);
    await fetch(`/api/sessions/${id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
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

  const isActive = session?.status === "active";

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center px-6 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-neutral-500 hover:text-neutral-300 text-sm">
            &larr; Back
          </Link>
          <span className="text-base font-semibold text-white">
            {session?.name || "Loading..."}
          </span>
          {session && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${
                isActive
                  ? "bg-green-950/50 text-green-400"
                  : session.status === "paused"
                  ? "bg-yellow-950/50 text-yellow-400"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {session.status}
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center text-xs text-neutral-500">
          {session?.model}
          {isActive && (
            <>
              <button
                onClick={handlePause}
                className="ml-3 px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-300 hover:text-white"
              >
                Pause
              </button>
              <button
                onClick={handleComplete}
                className="px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-300 hover:text-white"
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
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
              Loading messages...
            </div>
          ) : (
            <MessageList messages={messages} />
          )}
          <MessageInput
            onSend={handleSend}
            disabled={!isActive || sending}
          />
        </div>

        {session && (
          <SessionContextPanel
            sessionId={id}
            projectId={session.projectId}
            projectPath={session.projectPath || ""}
            model={session.model}
            messageCount={messages.length}
          />
        )}
      </div>
    </div>
  );
}
