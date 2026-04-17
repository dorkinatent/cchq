import { NextRequest, NextResponse } from "next/server";
import { extractFromRecentMessages } from "@/lib/sessions/knowledge-extractor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const count = typeof body.count === "number" && body.count > 0 ? Math.min(body.count, 30) : 6;

  try {
    const entries = await extractFromRecentMessages(id, count);
    return NextResponse.json({ entries, count: entries.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
