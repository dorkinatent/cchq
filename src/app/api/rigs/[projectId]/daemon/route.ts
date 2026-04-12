import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, startDaemon, stopDaemon } from "@/lib/engines/gastown";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });

  const { action } = await req.json();
  if (action === "start") {
    const result = await startDaemon(rig);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (action === "stop") {
    const result = await stopDaemon(rig);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "action must be start or stop" }, { status: 400 });
}
