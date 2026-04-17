import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export type TrustLevel = "full_auto" | "auto_log" | "ask_me";
export type PermissionDecision = "allow" | "deny" | "ask";

export type ToolCall = {
  toolName: string;
  input: Record<string, unknown>;
};

export type PermissionResult = {
  decision: PermissionDecision;
  /** Which rule matched, or null if fell through to trust level */
  matchedRuleId: string | null;
  /** Human-readable reason for the decision */
  reason: string;
};

type PermissionRule = {
  id: string;
  toolPattern: string;
  actionPattern: string | null;
  decision: "allow" | "deny" | "ask";
  priority: number;
};

/**
 * Check if a tool pattern matches a tool name.
 * "*" matches everything, otherwise exact match (case-insensitive).
 */
function matchesTool(pattern: string, toolName: string): boolean {
  if (pattern === "*") return true;
  return pattern.toLowerCase() === toolName.toLowerCase();
}

/**
 * Check if an action pattern matches the tool input.
 * null pattern matches everything.
 * Otherwise, treats the pattern as a regex tested against
 * a stringified representation of the input.
 */
function matchesAction(pattern: string | null, input: Record<string, unknown>): boolean {
  if (pattern === null) return true;

  // Build a searchable string from common input fields
  const searchable = [
    input.file_path,
    input.command,
    input.pattern,
    input.old_string,
    input.new_string,
    input.content,
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const regex = new RegExp(pattern, "i");
    return regex.test(searchable);
  } catch {
    // Invalid regex — treat as literal substring match
    return searchable.toLowerCase().includes(pattern.toLowerCase());
  }
}

/**
 * Evaluate a tool call against project rules and session trust level.
 *
 * Evaluation order:
 * 1. Project rules sorted by priority (highest first), then most-specific tool pattern first
 * 2. If no rule matches, fall back to session trust level:
 *    - full_auto → allow
 *    - auto_log → allow (caller handles logging)
 *    - ask_me → ask
 */
export async function evaluatePermission(
  projectId: string,
  trustLevel: TrustLevel,
  toolCall: ToolCall
): Promise<PermissionResult> {
  // Fetch rules for this project, ordered by priority desc
  const rules = await db.query.permissionRules.findMany({
    where: eq(schema.permissionRules.projectId, projectId),
    orderBy: [desc(schema.permissionRules.priority)],
  });

  return evaluatePermissionWithRules(rules, trustLevel, toolCall);
}

/**
 * Pure evaluation function — takes rules directly, no DB access.
 * Useful for testing.
 */
export function evaluatePermissionWithRules(
  rules: PermissionRule[],
  trustLevel: TrustLevel,
  toolCall: ToolCall
): PermissionResult {
  // Sort: specific tool patterns before "*", then by priority desc
  const sorted = [...rules].sort((a, b) => {
    // Priority first
    if (b.priority !== a.priority) return b.priority - a.priority;
    // Specific patterns before wildcards
    const aSpecific = a.toolPattern !== "*" ? 1 : 0;
    const bSpecific = b.toolPattern !== "*" ? 1 : 0;
    return bSpecific - aSpecific;
  });

  for (const rule of sorted) {
    if (matchesTool(rule.toolPattern, toolCall.toolName) && matchesAction(rule.actionPattern, toolCall.input)) {
      return {
        decision: rule.decision,
        matchedRuleId: rule.id,
        reason: `Matched rule: ${rule.toolPattern}${rule.actionPattern ? ` (${rule.actionPattern})` : ""} → ${rule.decision}`,
      };
    }
  }

  // No rule matched — fall back to trust level
  switch (trustLevel) {
    case "full_auto":
      return { decision: "allow", matchedRuleId: null, reason: "Trust level: full auto" };
    case "auto_log":
      return { decision: "allow", matchedRuleId: null, reason: "Trust level: auto with logging" };
    case "ask_me":
      return { decision: "ask", matchedRuleId: null, reason: "Trust level: ask me" };
  }
}
