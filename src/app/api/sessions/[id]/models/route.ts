import { NextRequest, NextResponse } from "next/server";
import { getAvailableModels, switchModel } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const models = await getAvailableModels(id);
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { model } = await req.json();
  const ok = await switchModel(id, model);
  if (!ok) {
    return NextResponse.json({ error: "Failed to switch model" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, model });
}
