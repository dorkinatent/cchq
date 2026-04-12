import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, listAgents } from "@/lib/engines/gastown";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });
  const agents = await listAgents(rig);
  return NextResponse.json(agents);
}
