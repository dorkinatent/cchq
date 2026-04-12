"use client";

import { NewSessionDialog } from "@/components/new-session-dialog";
import { useSessionSwitcher } from "./context";

// Thin portal — mounts the dialog once, globally, and wires it to the
// SessionSwitcherProvider state so any trigger (rail button, ⌘⇧N, dashboard
// button) opens the same instance.
export function NewSessionPortal() {
  const { newSessionOpen, closeNewSession } = useSessionSwitcher();
  return <NewSessionDialog open={newSessionOpen} onClose={closeNewSession} />;
}
