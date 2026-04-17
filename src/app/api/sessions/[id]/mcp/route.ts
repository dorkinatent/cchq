import { NextRequest, NextResponse } from "next/server";
import { getMcpStatus } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const servers = await getMcpStatus(id);
    return NextResponse.json({ servers });
  } catch {
    return NextResponse.json({ servers: [] });
  }
}
