"use client";
import { useEffect, type RefObject } from "react";

/** Fires onClose when a mousedown lands outside the given ref, only while open. */
export function useOutsideClick(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [ref, open, onClose]);
}
