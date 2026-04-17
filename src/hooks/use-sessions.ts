"use client";

import { useEffect, useRef, useState } from "react";

export type Session = {
  id: string;
  project_id: string;
  status: "active" | "paused" | "completed" | "errored";
  model: string;
  name: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  project_name?: string;
  project_path?: string;
  message_count?: number;
  last_message?: string;
};

export function useSessions(projectId?: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      try {
        const res = await fetch(`/api/sessions${qs}`, { cache: "no-store", signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Session[];
        if (!cancelled) {
          setSessions(data);
          setLoading(false);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[useSessions] fetch failed", err);
        if (!cancelled) setLoading(false);
      }
    }

    fetchSessions();

    const es = new EventSource("/api/sessions/stream");
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt.type === "ping") return;
        // Any session_*/message_added event may affect the list; refetch.
        fetchSessions();
      } catch {}
    };
    es.onerror = () => {
      // Browser auto-reconnects; no-op.
    };

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      es.close();
    };
  }, [projectId]);

  return { sessions, loading };
}
