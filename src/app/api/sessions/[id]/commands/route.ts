import { NextRequest, NextResponse } from "next/server";
import { getSessionCommands } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const commands = await getSessionCommands(id);
    return NextResponse.json(commands);
  } catch {
    return NextResponse.json([]);
  }
}
