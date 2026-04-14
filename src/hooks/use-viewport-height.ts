"use client";

import { useEffect, useState } from "react";

/**
 * Returns the actual visible viewport height as a CSS value.
 * Uses window.visualViewport.height which correctly accounts for the iOS
 * keyboard, Safari URL bar, and other browser chrome — unlike CSS units
 * (vh, dvh, svh) which are unreliable during keyboard transitions.
 *
 * Falls back to 100dvh on SSR / non-supporting browsers.
 */
export function useViewportHeight(): string {
  const [height, setHeight] = useState("100dvh");

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      setHeight(`${vv!.height}px`);
    }

    update();
    vv.addEventListener("resize", update);
    window.addEventListener("resize", update);

    return () => {
      vv.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return height;
}
