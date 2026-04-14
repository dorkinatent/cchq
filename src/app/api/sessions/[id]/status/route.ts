import { NextRequest, NextResponse } from "next/server";
import { getSessionHealthStatus, getPermissionInfo } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(_req.url);
  const kind = url.searchParams.get("kind") || "health";

  try {
    if (kind === "permissions") {
      const info = await getPermissionInfo(id);
      return NextResponse.json(info ?? { trustLevel: "unknown", permissionMode: "unknown", rules: [] });
    }
    const status = await getSessionHealthStatus(id);
    return NextResponse.json(status ?? { error: "Session not found" });
  } catch {
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
