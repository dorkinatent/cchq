/**
 * Shared types across all engine implementations.
 * The "engine" abstraction lets CCUI route backend operations to different
 * session/agent management systems based on project.engine.
 */

export type EngineKind = "sdk" | "gastown";

// --- Gas Town specific shared types ---

export type RigConfig = {
  id: string;
  projectId: string;
  townPath: string;
  rigName: string;
};

export type DaemonStatus = "running" | "stopped" | "starting" | "error" | "unknown";

export type AgentState = "working" | "idle" | "stalled" | "gupp" | "zombie" | "unknown";

export type Agent = {
  name: string;
  role: string;
  state: AgentState;
  lastActivity: string;
  currentBead?: string;
};

export type Bead = {
  id: string;
  title: string;
  priority?: string;
  tags?: string[];
  status?: string;
  assignee?: string;
};

export type RigEvent = {
  eventType: string;
  actor?: string;
  payload: Record<string, unknown>;
  timestamp: string;
};
