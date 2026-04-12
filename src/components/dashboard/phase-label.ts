import type { OverviewSession } from "@/app/api/sessions/overview/route";
import { relativeTime } from "@/lib/relative-time";

/**
 * Derives a short phase label for a session based on its live state,
 * DB status, and queued message count.
 *
 * Derivation priority (highest first):
 *   1. blockedInfo             → "Waiting: <tool>"
 *   2. currentTool (live)      → "Using <tool>: <preview>"
 *   3. hasActiveQuery (live)   → "Thinking <Ns>"
 *   4. queued messages         → "Queued: N msg(s)"
 *   5. status === "paused"     → "Paused <relative>"
 *   6. status === "errored"    → "Errored"
 *   7. status === "completed"  → "Completed <relative>"
 *   8. otherwise               → "Idle"
 *
 * Tool input preview uses the same fallback chain as the blocked
 * summary (command / file_path / path / url) trimmed to ~40 chars.
 */
export function toolInputPreview(input: Record<string, unknown> | null | undefined): string {
  if (!input) return "";
  const candidates = ["command", "file_path", "path", "url", "pattern", "query"] as const;
  for (const key of candidates) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) {
      return v.trim().slice(0, 60);
    }
  }
  return "";
}

export function phaseLabel(
  s: OverviewSession,
  now: number,
  queuedCount: number
): { text: string; tone: "default" | "streaming" | "blocked" | "muted" } {
  if (s.blockedInfo) {
    return {
      text: `Waiting: ${s.blockedInfo.toolName}${
        s.blockedInfo.preview ? ` · ${s.blockedInfo.preview.slice(0, 40)}` : ""
      }`,
      tone: "blocked",
    };
  }

  const live = s.liveState;
  if (live?.currentToolName) {
    const preview = toolInputPreview(live.currentToolInput);
    return {
      text: preview
        ? `Using ${live.currentToolName}: ${preview}`
        : `Using ${live.currentToolName}`,
      tone: "streaming",
    };
  }

  if (live?.hasActiveQuery) {
    const startedAt = live.currentToolStartedAt ?? new Date(s.updatedAt).getTime();
    const secs = Math.max(0, Math.round((now - startedAt) / 1000));
    return { text: `Thinking ${secs}s`, tone: "streaming" };
  }

  if (queuedCount > 0) {
    return {
      text: `Queued: ${queuedCount} msg${queuedCount === 1 ? "" : "s"}`,
      tone: "default",
    };
  }

  if (s.status === "paused") {
    return { text: `Paused ${relativeTime(s.updatedAt)}`, tone: "muted" };
  }
  if (s.status === "errored") {
    return { text: "Errored", tone: "blocked" };
  }
  if (s.status === "completed") {
    return { text: `Completed ${relativeTime(s.updatedAt)}`, tone: "muted" };
  }

  return { text: "Idle", tone: "muted" };
}

export type SortBucket =
  | "blocked"
  | "streaming"
  | "idle_active"
  | "paused"
  | "errored"
  | "completed";

export function sortBucket(s: OverviewSession): SortBucket {
  if (s.blockedInfo) return "blocked";
  if (s.liveState?.hasActiveQuery) return "streaming";
  if (s.status === "paused") return "paused";
  if (s.status === "errored") return "errored";
  if (s.status === "completed") return "completed";
  return "idle_active";
}

const BUCKET_ORDER: Record<SortBucket, number> = {
  blocked: 0,
  streaming: 1,
  idle_active: 2,
  paused: 3,
  errored: 4,
  completed: 5,
};

export function compareSessions(a: OverviewSession, b: OverviewSession): number {
  const ba = BUCKET_ORDER[sortBucket(a)];
  const bb = BUCKET_ORDER[sortBucket(b)];
  if (ba !== bb) return ba - bb;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
