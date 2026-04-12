import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type ToolUseBlock = {
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rows = await db
    .select({ toolUse: schema.messages.toolUse })
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, id));

  // Aggregate tool counts + unique files touched.
  const toolCounts: Record<string, number> = {};
  const filesTouched = new Set<string>();
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  let totalToolCalls = 0;

  for (const row of rows) {
    const blocks = row.toolUse as ToolUseBlock[] | null;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      const name = block?.name;
      if (!name) continue;
      totalToolCalls++;
      toolCounts[name] = (toolCounts[name] ?? 0) + 1;

      const input = (block.input ?? {}) as Record<string, unknown>;
      const filePath =
        typeof input.file_path === "string"
          ? input.file_path
          : typeof input.path === "string"
            ? input.path
            : undefined;
      if (!filePath) continue;

      filesTouched.add(filePath);
      if (name === "Write" || name === "Edit" || name === "MultiEdit") {
        filesWritten.add(filePath);
      } else if (name === "Read") {
        filesRead.add(filePath);
      }
    }
  }

  // Sort tool counts desc for a compact rendered string.
  const topTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({
    totalToolCalls,
    topTools,
    filesTouched: Array.from(filesTouched).sort(),
    filesRead: filesRead.size,
    filesWritten: filesWritten.size,
  });
}
