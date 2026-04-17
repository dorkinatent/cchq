import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, ilike } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const q = req.nextUrl.searchParams.get("q");

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results = await db.query.messages.findMany({
    where: and(
      eq(schema.messages.sessionId, id),
      ilike(schema.messages.content, `%${q}%`)
    ),
    orderBy: [schema.messages.createdAt],
    limit: 50,
  });

  return NextResponse.json({ results });
}
