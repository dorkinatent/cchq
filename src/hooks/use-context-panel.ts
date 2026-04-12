"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "ccui-context-panel-open";

export function useContextPanel(defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw !== null) setOpen(raw === "1");
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { open, toggle, hydrated };
}
