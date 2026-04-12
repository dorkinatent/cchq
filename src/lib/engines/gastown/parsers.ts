import type {
  Agent,
  AgentState,
  Bead,
  DaemonStatus,
  RigEvent,
} from "../types";

export function parseDaemonStatus(stdout: string): DaemonStatus {
  const s = stdout.toLowerCase();
  if (!s.trim()) return "unknown";
  if (s.includes("running")) return "running";
  if (s.includes("stopped") || s.includes("not running")) return "stopped";
  if (s.includes("starting")) return "starting";
  if (s.includes("error")) return "error";
  return "unknown";
}

function parseAgentState(raw: string): AgentState {
  const s = raw.toLowerCase().trim();
  if (s === "working") return "working";
  if (s === "idle") return "idle";
  if (s === "stalled") return "stalled";
  if (s === "gupp") return "gupp";
  if (s === "zombie") return "zombie";
  return "unknown";
}

export function parseAgents(stdout: string): Agent[] {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const agents: Agent[] = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    const [name, role, stateRaw, ...rest] = parts;
    const bead = rest[rest.length - 1];
    const currentBead = bead && bead !== "-" ? bead : undefined;
    const lastActivityTokens = rest.slice(0, rest.length - 1);
    const lastActivity = lastActivityTokens.join(" ") || "-";
    agents.push({
      name,
      role,
      state: parseAgentState(stateRaw),
      lastActivity,
      currentBead,
    });
  }
  return agents;
}

export function parseReadyBeads(stdout: string): Bead[] {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const beads: Bead[] = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const [id, priority, ...rest] = parts;
    const last = rest[rest.length - 1];
    const hasTags = last && last.includes(",");
    const tags = hasTags ? last.split(",").map((t) => t.trim()) : undefined;
    const titleTokens = hasTags ? rest.slice(0, rest.length - 1) : rest;
    const title = titleTokens.join(" ");
    beads.push({ id, priority, title, tags });
  }
  return beads;
}

export function parseEventLine(line: string): RigEvent | null {
  try {
    const obj = JSON.parse(line);
    if (!obj || typeof obj !== "object") return null;
    const eventType =
      (obj as { type?: unknown }).type ||
      (obj as { event_type?: unknown }).event_type;
    if (typeof eventType !== "string") return null;
    const actor = typeof (obj as { actor?: unknown }).actor === "string"
      ? (obj as { actor: string }).actor
      : undefined;
    const timestamp =
      typeof (obj as { timestamp?: unknown }).timestamp === "string"
        ? (obj as { timestamp: string }).timestamp
        : new Date().toISOString();
    return {
      eventType,
      actor,
      timestamp,
      payload: obj as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}
