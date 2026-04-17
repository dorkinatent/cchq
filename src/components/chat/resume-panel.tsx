"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/relative-time";
import { KnowledgeDelta } from "./knowledge-delta";

type MessageSummary = {
  id: string;
  role: string;
  content: string;
};

export function ResumePanel({
  sessionId,
  projectId,
  pausedAt,
  onResume,
}: {
  sessionId: string;
  projectId: string;
  pausedAt: string;
  onResume: (note?: string) => void;
}) {
  const [lastMessages, setLastMessages] = useState<MessageSummary[]>([]);
  const [note, setNote] = useState("");
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/messages?limit=3`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          if (!cancelled) setLastMessages([]);
          return;
        }
        const body = (await res.json()) as {
          messages: MessageSummary[];
          hasMore: boolean;
        };
        if (!cancelled) setLastMessages(body.messages);
      } catch {
        if (!cancelled) setLastMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  function handleResume() {
    setResuming(true);
    onResume(note.trim() || undefined);
  }

  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Paused status */}
        <div className="flex items-center gap-2">
          <span className="text-[var(--paused-text)] text-sm font-medium">
            ◑ Paused {relativeTime(pausedAt)}
          </span>
        </div>

        {/* Last messages summary */}
        {lastMessages.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              Last messages
            </div>
            {lastMessages.map((msg) => (
              <div
                key={msg.id}
                className="text-xs text-[var(--text-secondary)] truncate"
              >
                <span className="text-[var(--text-muted)] mr-1.5">
                  {msg.role === "user" ? "You:" : "Claude:"}
                </span>
                {msg.content.length > 150 ? msg.content.slice(0, 150) + "..." : msg.content}
              </div>
            ))}
          </div>
        )}

        {/* Knowledge delta */}
        <KnowledgeDelta projectId={projectId} since={pausedAt} />

        {/* Resumption note */}
        <div>
          <label className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] block mb-1.5">
            Resumption note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should Claude focus on when resuming?"
            className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--accent)]"
            rows={2}
            disabled={resuming}
          />
        </div>

        {/* Resume button */}
        <button
          onClick={handleResume}
          disabled={resuming}
          className="w-full py-2 px-4 bg-[var(--accent)] text-[var(--bg)] rounded-md text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
        >
          {resuming ? "Resuming..." : "Resume Session"}
        </button>
      </div>
    </div>
  );
}
