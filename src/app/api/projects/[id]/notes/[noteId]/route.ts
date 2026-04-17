import { NextRequest, NextResponse } from "next/server";
import { getNote, updateNote, deleteNote } from "@/lib/docs/notes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { noteId } = await params;
  const note = await getNote(noteId);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(note);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { noteId } = await params;
  const body = await req.json();
  const patch: { title?: string; content?: string } = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.content === "string") patch.content = body.content;
  const updated = await updateNote(noteId, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { noteId } = await params;
  await deleteNote(noteId);
  return NextResponse.json({ ok: true });
}
