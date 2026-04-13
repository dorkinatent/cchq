import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  getAllLiveSessionSummaries,
  getBlockedSessionsSummary,
  type LiveSessionSummary,
} from "@/lib/sessions/manager";

export const dynamic = "force-dynamic";

// NOTE: No ETag / 304 on this endpoint. Live state (thinking → tool_use) and
// blockedInfo contents can change without shifting the row count or maxUpdated
// fingerprint, so a cheap ETag here serves stale data to the 3s-poll UI.

export type OverviewSession = {
  id: string;
  name: string;
  projectId: string;
  project_name: string | null;
  project_path: string | null;
  status: "active" | "paused" | "completed" | "errored";
  trustLevel: string;
  model: string;
  usage: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  sdkSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: {
    role: string;
    content: string;
    createdAt: string;
  } | null;
  liveState: LiveSessionSummary | null;
  blockedInfo: { toolName: string; preview: string } | null;
};

export async function GET() {
  try {
    // One round-trip for sessions + joined project name/path.
    const rows = (await db.execute(sql`
      SELECT
        s.id,
        s.name,
        s.project_id         AS "projectId",
        s.status,
        s.trust_level        AS "trustLevel",
        s.model,
        s.usage,
        s.sdk_session_id     AS "sdkSessionId",
        s.created_at         AS "createdAt",
        s.updated_at         AS "updatedAt",
        p.name               AS "project_name",
        p.path               AS "project_path"
      FROM sessions s
      LEFT JOIN projects p ON p.id = s.project_id
      ORDER BY s.updated_at DESC
    `)) as unknown as Array<{
      id: string;
      name: string;
      projectId: string;
      status: OverviewSession["status"];
      trustLevel: string;
      model: string;
      usage: OverviewSession["usage"];
      sdkSessionId: string | null;
      createdAt: string;
      updatedAt: string;
      project_name: string | null;
      project_path: string | null;
    }>;

    // Most-recent message per session in one query via DISTINCT ON.
    // Slice content in SQL so we ship 200 bytes/row instead of pulling the full
    // body across the wire just to drop it client-side.
    const lastMessages = (await db.execute(sql`
      SELECT DISTINCT ON (session_id)
        session_id         AS "sessionId",
        role,
        LEFT(content, 200) AS content,
        created_at         AS "createdAt"
      FROM messages
      ORDER BY session_id, created_at DESC
    `)) as unknown as Array<{
      sessionId: string;
      role: string;
      content: string;
      createdAt: string;
    }>;

    const lastMessageBySession = new Map<string, OverviewSession["lastMessage"]>();
    for (const m of lastMessages) {
      lastMessageBySession.set(m.sessionId, {
        role: m.role,
        content: m.content || "",
        createdAt: m.createdAt,
      });
    }

    const liveStates = getAllLiveSessionSummaries();
    const blocked = getBlockedSessionsSummary();

    const out: OverviewSession[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      projectId: r.projectId,
      project_name: r.project_name,
      project_path: r.project_path,
      status: r.status,
      trustLevel: r.trustLevel,
      model: r.model,
      usage: r.usage,
      sdkSessionId: r.sdkSessionId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastMessage: lastMessageBySession.get(r.id) ?? null,
      liveState: liveStates[r.id] ?? null,
      blockedInfo: blocked[r.id] ?? null,
    }));

    return NextResponse.json({ sessions: out });
  } catch (err) {
    console.error("[overview] failed to load", err);
    return NextResponse.json({ error: "Failed to load overview" }, { status: 500 });
  }
}
