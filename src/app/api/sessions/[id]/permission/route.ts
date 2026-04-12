import { NextRequest, NextResponse } from "next/server";
import { respondToPermission, getPendingPermissions } from "@/lib/sessions/manager";

/**
 * GET — List pending permission requests for a session.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const pending = getPendingPermissions(sessionId);
  return NextResponse.json(pending);
}

/**
 * POST — Respond to a pending permission request.
 *
 * Body: {
 *   requestId: string,
 *   decision: "allow" | "deny",
 *   createRule?: boolean,     // create a project rule to auto-allow this pattern
 *   reason?: string,          // why the user denied
 *   alternative?: string      // user's suggested alternative
 * }
 */
export async function POST(req: NextRequest) {
  const { requestId, decision, createRule, reason, alternative } = await req.json();

  if (!requestId || !decision) {
    return NextResponse.json(
      { error: "requestId and decision are required" },
      { status: 400 }
    );
  }

  if (!["allow", "deny"].includes(decision)) {
    return NextResponse.json(
      { error: "decision must be 'allow' or 'deny'" },
      { status: 400 }
    );
  }

  respondToPermission(requestId, decision, { reason, alternative, createRule });

  return NextResponse.json({ ok: true });
}
