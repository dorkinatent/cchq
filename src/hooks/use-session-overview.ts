"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { OverviewSession } from "@/app/api/sessions/overview/route";
import { messageQueue, type QueuedMessage } from "@/lib/message-queue";

const POLL_MS = 3000;

export function useSessionOverview() {
  const [sessions, setSessions] = useState<OverviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOnce = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/sessions/overview", {
        cache: "no-store",
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`overview: ${res.status}`);
      const body = (await res.json()) as { sessions: OverviewSession[] };
      setSessions(body.sessions);
      setError(null);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOnce();
    const interval = window.setInterval(fetchOnce, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", fetchOnce);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", fetchOnce);
      abortRef.current?.abort();
    };
  }, [fetchOnce]);

  return { sessions, loading, error, refetch: fetchOnce };
}

/**
 * Returns a map of sessionId -> count of not-yet-sent queued messages
 * ("queued" or "failed"). Subscribes to the in-memory queue bus so it
 * updates live without polling.
 */
export function useAllQueues(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const read = () => {
      try {
        const raw =
          typeof window !== "undefined"
            ? localStorage.getItem("ccui-message-queue")
            : null;
        if (!raw) {
          setCounts({});
          return;
        }
        const all = JSON.parse(raw) as QueuedMessage[];
        const next: Record<string, number> = {};
        for (const m of all) {
          if (m.status === "queued" || m.status === "failed") {
            next[m.sessionId] = (next[m.sessionId] || 0) + 1;
          }
        }
        setCounts(next);
      } catch {
        setCounts({});
      }
    };
    read();
    const unsub = messageQueue.subscribe(read);
    // Also pick up cross-tab changes.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ccui-message-queue") read();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return counts;
}
