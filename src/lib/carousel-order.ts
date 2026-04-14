/**
 * Shared carousel ordering utility.
 *
 * Ordering rules:
 * 1. Blocked or errored sessions float to the front (most attention-needed first).
 * 2. Remaining sessions sorted by recency — MRU list first, then by updatedAt descending.
 *
 * Used by both the mobile swipe carousel and the cmd+shift+[/] keyboard shortcuts.
 */

export type CarouselSession = {
  id: string;
  state: "blocked" | "errored" | "streaming" | "idle" | "paused" | "completed";
  updated_at: string;
};

/**
 * Returns session IDs in carousel order.
 *
 * @param sessions - All enriched sessions
 * @param recent - MRU list from prefs (most-recent-first)
 */
export function carouselOrder(
  sessions: CarouselSession[],
  recent: string[]
): string[] {
  const recentRank = new Map(recent.map((id, i) => [id, i]));

  const urgent = sessions
    .filter((s) => s.state === "blocked" || s.state === "errored")
    .sort((a, b) => {
      const urgencyScore = (s: CarouselSession) =>
        s.state === "blocked" ? 0 : 1;
      const diff = urgencyScore(a) - urgencyScore(b);
      if (diff !== 0) return diff;
      const ra = recentRank.get(a.id) ?? Infinity;
      const rb = recentRank.get(b.id) ?? Infinity;
      if (ra !== rb) return ra - rb;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  const rest = sessions
    .filter((s) => s.state !== "blocked" && s.state !== "errored")
    .sort((a, b) => {
      const ra = recentRank.get(a.id) ?? Infinity;
      const rb = recentRank.get(b.id) ?? Infinity;
      if (ra !== rb) return ra - rb;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  return [...urgent, ...rest].map((s) => s.id);
}
