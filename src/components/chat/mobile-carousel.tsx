"use client";

/**
 * MobileCarousel — gesture overlay for swipe-to-navigate between sessions.
 *
 * Architecture:
 * - Renders a transparent full-screen overlay on top of session content (mobile only).
 * - Captures horizontal touch gestures with raw touch handlers (no gesture library).
 * - Determines adjacent sessions using the shared carouselOrder utility.
 * - On commit: navigates via router.push + fires mobile-context-sheet:close if open.
 * - At list edges: rubber-band (translate up to 40px, spring back 200ms).
 * - Reduced motion: instant transition (0ms).
 *
 * Commit criteria (either):
 *   - displacement > 30% of viewport width, OR
 *   - velocity > 500px/s
 */

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSessionSwitcher } from "@/components/session-switcher/context";
import { carouselOrder } from "@/lib/carousel-order";

// Ease-out-quart easing for CSS transitions
const EASE_OUT_QUART = "cubic-bezier(0.165, 0.84, 0.44, 1)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MobileCarousel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { sessions, currentSessionId, prefs } = useSessionSwitcher();

  // The actual page content wrapper that we translate during swipe.
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Track touch state in a ref to avoid stale closures in touch handlers.
  const touchRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    lastX: number;
    directionLocked: boolean; // true once we decide horizontal vs vertical
    isHorizontal: boolean | null; // null = undecided
  } | null>(null);

  // Derived carousel order — recomputed when sessions or prefs.recent change.
  const orderedIds = carouselOrder(sessions, prefs.recent);
  const currentIdx = currentSessionId ? orderedIds.indexOf(currentSessionId) : -1;
  const prevId = currentIdx > 0 ? orderedIds[currentIdx - 1] : null;
  const nextId = currentIdx !== -1 && currentIdx < orderedIds.length - 1
    ? orderedIds[currentIdx + 1]
    : null;

  const translate = useCallback((dx: number, animated: boolean) => {
    const el = wrapperRef.current;
    if (!el) return;
    el.style.transition = animated
      ? `transform 200ms ${EASE_OUT_QUART}`
      : "none";
    el.style.transform = dx === 0 ? "" : `translateX(${dx}px)`;
  }, []);

  const commit = useCallback(
    (targetId: string) => {
      const el = wrapperRef.current;
      if (!el) return;
      const reduced = prefersReducedMotion();

      // Cross-fade + slide out. Direction: swipe-left goes to next (slide left).
      const dir = orderedIds.indexOf(targetId) > currentIdx ? -1 : 1;
      const vw = window.innerWidth;

      if (reduced) {
        router.push(`/sessions/${targetId}`);
        return;
      }

      // Slide the current page off-screen then navigate.
      el.style.transition = `opacity 250ms ${EASE_OUT_QUART}, transform 250ms ${EASE_OUT_QUART}`;
      el.style.opacity = "0";
      el.style.transform = `translateX(${dir * -vw * 0.35}px)`;

      setTimeout(() => {
        // Reset before navigation so the incoming page starts clean.
        el.style.transition = "none";
        el.style.opacity = "";
        el.style.transform = "";
        router.push(`/sessions/${targetId}`);
      }, 250);
    },
    [router, orderedIds, currentIdx]
  );

  const snapBack = useCallback(() => {
    translate(0, true);
  }, [translate]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        lastX: touch.clientX,
        directionLocked: false,
        isHorizontal: null,
      };
    }

    function onTouchMove(e: TouchEvent) {
      const state = touchRef.current;
      if (!state) return;

      const touch = e.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      state.lastX = touch.clientX;

      // Direction disambiguation — only lock after 8px movement.
      if (!state.directionLocked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        state.isHorizontal = Math.abs(dx) > Math.abs(dy);
        state.directionLocked = true;
      }

      if (!state.isHorizontal) return;

      // If the context sheet is open, swipe dismisses it instead.
      // We fire the event and swallow the gesture.
      const sheetOpen = document.querySelector("[data-mobile-context-sheet='open']");
      if (sheetOpen) {
        if (Math.abs(dx) > 40) {
          window.dispatchEvent(new CustomEvent("mobile-context-sheet:close"));
          touchRef.current = null;
          const wrapper = wrapperRef.current;
          if (wrapper) { wrapper.style.transition = "none"; wrapper.style.transform = ""; }
        }
        return;
      }

      e.preventDefault(); // prevent page scroll while swiping

      // Rubber-band at edges.
      const atLeftEdge = dx > 0 && !prevId;
      const atRightEdge = dx < 0 && !nextId;
      const atEdge = atLeftEdge || atRightEdge;

      const RUBBER_MAX = 40;
      const effective = atEdge
        ? Math.sign(dx) * Math.min(Math.abs(dx) * 0.3, RUBBER_MAX)
        : dx;

      translate(effective, false);
    }

    function onTouchEnd() {
      const state = touchRef.current;
      touchRef.current = null;

      if (!state || !state.isHorizontal) return;

      const dx = state.lastX - state.startX;
      const dt = (Date.now() - state.startTime) / 1000; // seconds
      const velocity = Math.abs(dx) / dt; // px/s
      const vw = window.innerWidth;
      const threshold = vw * 0.3;

      const shouldNavigate = Math.abs(dx) > threshold || velocity > 500;

      if (shouldNavigate) {
        const goNext = dx < 0 && nextId;
        const goPrev = dx > 0 && prevId;
        if (goNext) {
          commit(nextId);
          return;
        }
        if (goPrev) {
          commit(prevId);
          return;
        }
      }

      snapBack();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [prevId, nextId, translate, commit, snapBack]);

  return (
    <div ref={wrapperRef} className="flex flex-col h-full overflow-hidden will-change-transform">
      {children}
    </div>
  );
}

/**
 * Edge indicators — thin vertical bars at screen edges showing adjacent sessions.
 * Amber pulse when adjacent session is blocked. Hidden when no session in that direction.
 */
export function CarouselEdgeIndicators() {
  const { sessions, currentSessionId, prefs } = useSessionSwitcher();

  const orderedIds = carouselOrder(sessions, prefs.recent);
  const currentIdx = currentSessionId ? orderedIds.indexOf(currentSessionId) : -1;

  const prevId = currentIdx > 0 ? orderedIds[currentIdx - 1] : null;
  const nextId = currentIdx !== -1 && currentIdx < orderedIds.length - 1
    ? orderedIds[currentIdx + 1]
    : null;

  const prevSession = prevId ? sessions.find((s) => s.id === prevId) : null;
  const nextSession = nextId ? sessions.find((s) => s.id === nextId) : null;

  const prevBlocked = prevSession?.state === "blocked";
  const nextBlocked = nextSession?.state === "blocked";

  if (!prevId && !nextId) return null;

  return (
    <>
      {prevId && (
        <div
          aria-hidden
          className={`fixed left-0 top-0 bottom-0 w-[3px] z-20 md:hidden pointer-events-none ${
            prevBlocked ? "carousel-edge-blocked" : ""
          }`}
          style={{ background: "var(--surface-raised)" }}
        />
      )}
      {nextId && (
        <div
          aria-hidden
          className={`fixed right-0 top-0 bottom-0 w-[3px] z-20 md:hidden pointer-events-none ${
            nextBlocked ? "carousel-edge-blocked" : ""
          }`}
          style={{ background: "var(--surface-raised)" }}
        />
      )}
    </>
  );
}

/**
 * Position counter — shows "{current}/{total}" in the mobile header.
 * Hidden when total <= 1.
 */
export function CarouselPositionCounter() {
  const { sessions, currentSessionId, prefs } = useSessionSwitcher();

  const orderedIds = carouselOrder(sessions, prefs.recent);
  const currentIdx = currentSessionId ? orderedIds.indexOf(currentSessionId) : -1;
  const total = orderedIds.length;

  if (total <= 1 || currentIdx === -1) return null;

  return (
    <span
      className="text-[11px] tabular-nums text-[var(--text-muted)] select-none md:hidden"
      aria-label={`Session ${currentIdx + 1} of ${total}`}
    >
      {currentIdx + 1}/{total}
    </span>
  );
}
