import { NextResponse } from "next/server";
import { interruptSession } from "@/lib/sessions/manager";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await interruptSession(id);
  return NextResponse.json({ ok: true });
}
