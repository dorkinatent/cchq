import { describe, it, expect, beforeEach, afterAll } from "vitest";
import net from "net";

const hasDb = await new Promise<boolean>((resolve) => {
  const sock = net.createConnection({ host: "127.0.0.1", port: 54332 });
  sock.on("connect", () => { sock.destroy(); resolve(true); });
  sock.on("error", () => resolve(false));
  sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
});

describe.skipIf(!hasDb)("notes CRUD", () => {
  let db: any;
  let schema: any;
  let eq: any;
  let listNotes: any, createNote: any, updateNote: any, deleteNote: any, getNote: any;

  const TEST_PROJECT_ID = "11111111-1111-1111-1111-111111111111";
  const TEST_PROJECT_PATH = "/tmp/notes-test-project";

  beforeEach(async () => {
    ({ db, schema } = await import("@/lib/db"));
    ({ eq } = await import("drizzle-orm"));
    ({ listNotes, createNote, updateNote, deleteNote, getNote } = await import("../notes"));

    await db.delete(schema.projectNotes).where(eq(schema.projectNotes.projectId, TEST_PROJECT_ID));
    await db.delete(schema.projects).where(eq(schema.projects.id, TEST_PROJECT_ID));
    await db.insert(schema.projects).values({
      id: TEST_PROJECT_ID,
      name: "notes-test",
      path: TEST_PROJECT_PATH,
    });
  });

  afterAll(async () => {
    await db.delete(schema.projectNotes).where(eq(schema.projectNotes.projectId, TEST_PROJECT_ID));
    await db.delete(schema.projects).where(eq(schema.projects.id, TEST_PROJECT_ID));
  });

  it("creates and lists a note", async () => {
    const created = await createNote(TEST_PROJECT_ID, "My Note", "hello");
    expect(created.title).toBe("My Note");
    expect(created.content).toBe("hello");

    const notes = await listNotes(TEST_PROJECT_ID);
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(created.id);
  });

  it("updates an existing note", async () => {
    const n = await createNote(TEST_PROJECT_ID, "Original", "old");
    const updated = await updateNote(n.id, { title: "New Title", content: "new content" });
    expect(updated?.title).toBe("New Title");
    expect(updated?.content).toBe("new content");
  });

  it("deletes a note", async () => {
    const n = await createNote(TEST_PROJECT_ID, "Temp", "x");
    await deleteNote(n.id);
    const notes = await listNotes(TEST_PROJECT_ID);
    expect(notes).toHaveLength(0);
  });

  it("returns null for missing note", async () => {
    const n = await getNote("00000000-0000-0000-0000-000000000000");
    expect(n).toBeNull();
  });
});
