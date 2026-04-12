"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastVariant = "default" | "error";

type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
};

type ToastEntry = {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
};

type ToastContextValue = {
  toast: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 3500;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, opts?: ToastOptions) => {
    const id = ++idRef.current;
    const entry: ToastEntry = {
      id,
      message,
      variant: opts?.variant ?? "default",
      duration: opts?.duration ?? DEFAULT_DURATION,
    };
    setToasts((prev) => [...prev, entry]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} entry={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter transition on next frame
    const raf = requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(onDismiss, entry.duration);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [entry.duration, onDismiss]);

  const isError = entry.variant === "error";
  const borderClass = isError
    ? "border-[var(--errored-text)]"
    : "border-[var(--border)]";
  const textClass = isError
    ? "text-[var(--errored-text)]"
    : "text-[var(--text-primary)]";

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={[
        "text-left bg-[var(--surface-raised)] border rounded-lg px-4 py-2.5 text-sm shadow-lg",
        "transition-all duration-150 ease-out",
        borderClass,
        textClass,
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      ].join(" ")}
    >
      {entry.message}
    </button>
  );
}
