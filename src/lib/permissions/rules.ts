import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export type CreateRuleInput = {
  projectId: string;
  toolPattern: string;
  actionPattern?: string | null;
  decision: "allow" | "deny" | "ask";
  priority?: number;
};

export type UpdateRuleInput = {
  toolPattern?: string;
  actionPattern?: string | null;
  decision?: "allow" | "deny" | "ask";
  priority?: number;
};

export async function listRules(projectId: string) {
  return db.query.permissionRules.findMany({
    where: eq(schema.permissionRules.projectId, projectId),
    orderBy: (rules, { desc }) => [desc(rules.priority), desc(rules.createdAt)],
  });
}

export async function createRule(input: CreateRuleInput) {
  const [rule] = await db
    .insert(schema.permissionRules)
    .values({
      projectId: input.projectId,
      toolPattern: input.toolPattern,
      actionPattern: input.actionPattern ?? null,
      decision: input.decision,
      priority: input.priority ?? 0,
    })
    .returning();
  return rule;
}

export async function updateRule(ruleId: string, input: UpdateRuleInput) {
  const [rule] = await db
    .update(schema.permissionRules)
    .set({
      ...(input.toolPattern !== undefined ? { toolPattern: input.toolPattern } : {}),
      ...(input.actionPattern !== undefined ? { actionPattern: input.actionPattern } : {}),
      ...(input.decision !== undefined ? { decision: input.decision } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.permissionRules.id, ruleId))
    .returning();
  return rule;
}

export async function deleteRule(ruleId: string) {
  await db
    .delete(schema.permissionRules)
    .where(eq(schema.permissionRules.id, ruleId));
}

/**
 * Quick helper: create an "allow all like this" rule from a tool call.
 * Used when the user clicks "Allow all like this" on a permission card.
 */
export async function createAllowRule(projectId: string, toolName: string, actionPattern?: string) {
  return createRule({
    projectId,
    toolPattern: toolName,
    actionPattern: actionPattern ?? null,
    decision: "allow",
    priority: 10, // Higher than default so it takes precedence
  });
}
