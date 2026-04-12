import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, slingBead } from "@/lib/engines/gastown";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });

  const { target } = await req.json();
  if (!target) return NextResponse.json({ error: "target is required" }, { status: 400 });

  const result = await slingBead(rig, id, target);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
