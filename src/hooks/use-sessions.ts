"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

  useEffect(() => {
    async function fetchSessions() {
      let query = supabase
        .from("sessions")
        .select("*, projects(name, path)")
        .order("updated_at", { ascending: false });

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data } = await query;
      if (!data || data.length === 0) {
        setSessions([]);
        setLoading(false);
        return;
      }

      // Fetch message counts for all sessions in one query
      const sessionIds = data.map((s: any) => s.id);
      const { data: countsData } = await supabase
        .from("messages")
        .select("session_id")
        .in("session_id", sessionIds);

      const counts = new Map<string, number>();
      if (countsData) {
        for (const row of countsData as any[]) {
          counts.set(row.session_id, (counts.get(row.session_id) || 0) + 1);
        }
      }

      setSessions(
        data.map((s: any) => ({
          ...s,
          project_name: s.projects?.name,
          project_path: s.projects?.path,
          message_count: counts.get(s.id) || 0,
        }))
      );
      setLoading(false);
    }

    fetchSessions();

    const channel = supabase
      .channel("sessions-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}),
        },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  return { sessions, loading };
}
