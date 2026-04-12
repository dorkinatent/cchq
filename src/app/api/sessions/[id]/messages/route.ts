import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, lt, desc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const before = req.nextUrl.searchParams.get("before");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

  const conditions = [eq(schema.messages.sessionId, id)];
  if (before) conditions.push(lt(schema.messages.createdAt, before));

  const messages = await db.query.messages.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.messages.createdAt)],
    limit: limit + 1,
  });

  const hasMore = messages.length > limit;
  const result = hasMore ? messages.slice(0, limit) : messages;

  return NextResponse.json({ messages: result.reverse(), hasMore });
}
