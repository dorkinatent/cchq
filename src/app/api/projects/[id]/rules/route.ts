import { NextRequest, NextResponse } from "next/server";
import { listRules, createRule, deleteRule } from "@/lib/permissions/rules";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const rules = await listRules(projectId);
  return NextResponse.json(rules);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { toolPattern, actionPattern, decision, priority } = await req.json();

  if (!toolPattern || !decision) {
    return NextResponse.json(
      { error: "toolPattern and decision are required" },
      { status: 400 }
    );
  }

  const validTools = ["Read", "Edit", "Bash", "Write", "Grep", "Glob", "*"];
  if (!validTools.includes(toolPattern)) {
    return NextResponse.json(
      { error: `toolPattern must be one of: ${validTools.join(", ")}` },
      { status: 400 }
    );
  }

  const validDecisions = ["allow", "deny", "ask"];
  if (!validDecisions.includes(decision)) {
    return NextResponse.json(
      { error: `decision must be one of: ${validDecisions.join(", ")}` },
      { status: 400 }
    );
  }

  const rule = await createRule({
    projectId,
    toolPattern,
    actionPattern: actionPattern || null,
    decision,
    priority: priority ?? 0,
  });

  return NextResponse.json(rule, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ruleId = req.nextUrl.searchParams.get("ruleId");
  if (!ruleId) {
    return NextResponse.json({ error: "ruleId query param required" }, { status: 400 });
  }

  await deleteRule(ruleId);
  return NextResponse.json({ ok: true });
}
