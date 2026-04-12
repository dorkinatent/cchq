import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, getDaemonStatus } from "@/lib/engines/gastown";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig for this project" }, { status: 404 });
  const daemon = await getDaemonStatus(rig);
  return NextResponse.json({ daemon, rig });
}
