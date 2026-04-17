import { NextRequest, NextResponse } from "next/server";
import { completeSession } from "@/lib/sessions/manager";
import { extractKnowledge } from "@/lib/sessions/knowledge-extractor";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await completeSession(id);

  extractKnowledge(id).catch((err) =>
    console.error(`Knowledge extraction failed for ${id}:`, err)
  );

  return NextResponse.json({ ok: true });
}
