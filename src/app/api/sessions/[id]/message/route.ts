import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/sessions/manager";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content, attachments } = await req.json();

  try {
    await sendMessage(id, content, attachments);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
