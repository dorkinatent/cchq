import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { runGt } from "./cli";
import { createEventsTailer, type EventsTailer } from "./events";
import {
  parseAgents,
  parseDaemonStatus,
  parseReadyBeads,
} from "./parsers";
import type { Agent, Bead, DaemonStatus, RigConfig, RigEvent } from "../types";
import { join } from "path";

type RigSubscriber = (event: RigEvent) => void;

const activeTailers = new Map<string, EventsTailer>();
const subscribers = new Map<string, Set<RigSubscriber>>();

export async function getRigForProject(projectId: string): Promise<RigConfig | null> {
  const rig = await db.query.rigs.findFirst({
    where: eq(schema.rigs.projectId, projectId),
  });
  if (!rig || !rig.townPath || !rig.rigName) return null;
  return {
    id: rig.id,
    projectId: rig.projectId,
    townPath: rig.townPath,
    rigName: rig.rigName,
  };
}

export async function getDaemonStatus(rig: RigConfig): Promise<DaemonStatus> {
  const { stdout, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["daemon", "status"],
  });
  if (exitCode !== 0) return "error";
  return parseDaemonStatus(stdout);
}

export async function startDaemon(rig: RigConfig): Promise<{ ok: boolean; error?: string }> {
  const { stderr, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["daemon", "start"],
  });
  if (exitCode !== 0) return { ok: false, error: stderr || "Failed to start daemon" };
  return { ok: true };
}

export async function stopDaemon(rig: RigConfig): Promise<{ ok: boolean; error?: string }> {
  const { stderr, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["daemon", "stop"],
  });
  if (exitCode !== 0) return { ok: false, error: stderr || "Failed to stop daemon" };
  return { ok: true };
}

export async function listAgents(rig: RigConfig): Promise<Agent[]> {
  const { stdout, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["agents"],
  });
  if (exitCode !== 0) return [];
  return parseAgents(stdout);
}

export async function listReadyBeads(rig: RigConfig): Promise<Bead[]> {
  const { stdout, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["ready"],
  });
  if (exitCode !== 0) return [];
  return parseReadyBeads(stdout);
}

export async function createBead(
  rig: RigConfig,
  opts: { title: string; body?: string; assignee?: string }
): Promise<{ ok: boolean; error?: string }> {
  const args = ["assign", "--title", opts.title];
  if (opts.body) args.push("--body", opts.body);
  if (opts.assignee) args.push("--assignee", opts.assignee);
  const { stderr, exitCode } = await runGt({ townPath: rig.townPath, args });
  if (exitCode !== 0) return { ok: false, error: stderr || "Failed to create bead" };
  return { ok: true };
}

export async function slingBead(
  rig: RigConfig,
  beadId: string,
  target: string
): Promise<{ ok: boolean; error?: string }> {
  const { stderr, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["sling", beadId, "--to", target],
  });
  if (exitCode !== 0) return { ok: false, error: stderr || "Failed to sling bead" };
  return { ok: true };
}

export async function doctor(rig: RigConfig): Promise<{ ok: boolean; output: string }> {
  const { stdout, stderr, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["doctor"],
  });
  return { ok: exitCode === 0, output: stdout + stderr };
}

function ensureTailer(rig: RigConfig) {
  if (activeTailers.has(rig.id)) return;

  const eventsFile = join(rig.townPath, ".events.jsonl");
  const tailer = createEventsTailer(eventsFile, (event) => {
    db.insert(schema.rigEvents)
      .values({
        rigId: rig.id,
        eventType: event.eventType,
        actor: event.actor || null,
        payload: event.payload,
        timestamp: event.timestamp,
      })
      .catch((err: unknown) => console.error(`rig_events insert failed:`, err));

    const subs = subscribers.get(rig.id);
    if (subs) {
      for (const cb of subs) cb(event);
    }
  });
  activeTailers.set(rig.id, tailer);
}

export function subscribeToRigEvents(
  rig: RigConfig,
  callback: RigSubscriber
): () => void {
  ensureTailer(rig);
  if (!subscribers.has(rig.id)) {
    subscribers.set(rig.id, new Set());
  }
  subscribers.get(rig.id)!.add(callback);
  return () => {
    subscribers.get(rig.id)?.delete(callback);
  };
}
