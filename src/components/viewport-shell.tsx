"use client";

import { useViewportHeight } from "@/hooks/use-viewport-height";

/**
 * Client component that applies the JS-driven viewport height to the
 * app shell. Needed because layout.tsx is a server component and can't
 * use hooks. On iOS Safari, CSS viewport units (vh/dvh/svh) don't
 * update reliably during keyboard transitions, but visualViewport.height
 * does — this ensures the layout reflows correctly.
 */
export function ViewportShell({ children }: { children: React.ReactNode }) {
  const height = useViewportHeight();

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height }}
    >
      {children}
    </div>
  );
}
