"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";

export function RememberButton({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    toast("Extracting memories…");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/remember`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 6 }),
      });
      if (res.ok) {
        const data = await res.json();
        toast(
          data.count === 0
            ? "Nothing new worth remembering"
            : `Extracted ${data.count} new ${data.count === 1 ? "memory" : "memories"}`
        );
      } else {
        const data = await res.json().catch(() => ({}));
        toast(`Remember failed: ${data.error || "unknown"}`, { variant: "error" });
      }
    } catch (err) {
      toast(
        `Remember failed: ${err instanceof Error ? err.message : "network error"}`,
        { variant: "error" }
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title="Extract durable facts from the last 6 messages into this project's knowledge base — auto-injected into future sessions."
      className="px-2.5 py-1 text-[12px] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
    >
      {busy ? "Remembering…" : "Remember"}
    </button>
  );
}
