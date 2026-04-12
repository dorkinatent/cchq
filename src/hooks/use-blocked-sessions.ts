"use client";

import { useEffect, useState } from "react";

export type BlockedSummary = Record<string, { toolName: string; preview: string }>;

// Polls the in-memory pending-permissions map on the server.
// Lightweight: single tiny JSON per 3s, shared across every rail consumer via
// the hook's local cache. We intentionally don't push this through Supabase
// realtime because pending permissions live in-process, not in the DB.
export function useBlockedSessions(intervalMs = 3000) {
  const [blocked, setBlocked] = useState<BlockedSummary>({});

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/sessions/blocked", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { blocked: BlockedSummary };
        if (!cancelled) setBlocked(data.blocked ?? {});
      } catch {
        // Swallow transient errors — next tick will retry.
      }
    }

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return blocked;
}
