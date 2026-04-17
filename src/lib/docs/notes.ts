import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export type ProjectNote = {
  id: string;
  projectId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

function toProjectNote(row: typeof schema.projectNotes.$inferSelect): ProjectNote {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listNotes(projectId: string): Promise<ProjectNote[]> {
  const rows = await db.query.projectNotes.findMany({
    where: eq(schema.projectNotes.projectId, projectId),
    orderBy: [desc(schema.projectNotes.updatedAt)],
  });
  return rows.map(toProjectNote);
}

export async function getNote(id: string): Promise<ProjectNote | null> {
  const row = await db.query.projectNotes.findFirst({
    where: eq(schema.projectNotes.id, id),
  });
  return row ? toProjectNote(row) : null;
}

export async function createNote(
  projectId: string,
  title: string,
  content: string
): Promise<ProjectNote> {
  const [row] = await db
    .insert(schema.projectNotes)
    .values({ projectId, title, content })
    .returning();
  return toProjectNote(row);
}

export async function updateNote(
  id: string,
  patch: { title?: string; content?: string }
): Promise<ProjectNote | null> {
  const [row] = await db
    .update(schema.projectNotes)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(schema.projectNotes.id, id))
    .returning();
  return row ? toProjectNote(row) : null;
}

export async function deleteNote(id: string): Promise<void> {
  await db.delete(schema.projectNotes).where(eq(schema.projectNotes.id, id));
}
