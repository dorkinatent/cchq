import { NextResponse } from "next/server";
import { getBlockedSessionsSummary } from "@/lib/sessions/manager";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ blocked: getBlockedSessionsSummary() });
}
