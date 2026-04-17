"use client";

import { useEffect, useState } from "react";

/**
 * Page-level clock tick. One setInterval per mount, regardless of how
 * many components subscribe. Default cadence: 1000ms.
 *
 * Use at the top of a page (or a stable parent), pass the result down
 * as a prop, so 30 session rows share one timer instead of spawning 30.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
