import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, listReadyBeads, createBead } from "@/lib/engines/gastown";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });
  const beads = await listReadyBeads(rig);
  return NextResponse.json(beads);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });

  const { title, body, assignee } = await req.json();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const result = await createBead(rig, { title, body, assignee });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
