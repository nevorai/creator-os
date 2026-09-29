// M-00 Chief of Staff. A running chat, not per-topic like Studio -- one
// conversation, so it can see feedback trends across the whole team over
// time. When Adarsh gives feedback on an employee, it can call
// propose_employee_change, which is recorded as a PENDING proposal, never
// applied automatically. Applying/rejecting happens from the Manager screen
// as a plain table write against `employees` -- no separate edge function,
// since the owner-only RLS (migration 0012) already allows his write.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor, json } from "../_shared/cors.ts";
import { ownerOnly } from "../_shared/owner.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROPOSE_TOOL = {
  name: "propose_employee_change",
  description:
    "Propose one specific change to an AI employee's settings, for Adarsh to review and approve. " +
    "Only call this when he has clearly asked for something to change about a named employee or " +
    "desk -- not for general chat, questions, or status updates.",
  input_schema: {
    type: "object",
    properties: {
      employee_code: { type: "string", description: "e.g. 'C-02'" },
      field: { type: "string", enum: ["prompt", "model", "schedule", "enabled"] },
      new_value: {
        type: "string",
        description: "The full new value. For 'enabled' use exactly 'true' or 'false'.",
      },
      rationale: { type: "string", description: "One sentence: why, tied to what Adarsh said." },
    },
    required: ["employee_code", "field", "new_value", "rationale"],
  },
};

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, string> };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });

  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    db: { schema: "creator_os" },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await asCaller.auth.getUser();
  if (authError || !userData?.user) {
    return json(req, { error: "Not signed in." }, 401);
  }
  // Signed in is not enough in the shared Nevorai OS project: only a Creator OS owner gets past here.
  const notOwner = await ownerOnly(req);
  if (notOwner) return notOwner;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: "creator_os" } });

  const { data: settings } = await supabase
    .from("app_settings")
    .select("anthropic_api_key")
    .eq("id", 1)
    .single();
  const apiKey = settings?.anthropic_api_key;
  if (!apiKey) {
    return json(req, { error: "No Anthropic key saved. Add one in Settings first." }, 400);
  }

  const body = (await req.json()) as { message?: string };
  if (!body.message?.trim()) {
    return json(req, { error: "message is required" }, 400);
  }

  const { data: userMsg, error: insertUserErr } = await supabase
    .from("manager_messages")
    .insert({ role: "user", content: body.message })
    .select("id")
    .single();
  if (insertUserErr) return json(req, { error: insertUserErr.message }, 500);

  const { data: history } = await supabase
    .from("manager_messages")
    .select("role, content")
    .order("created_at", { ascending: true })
    .limit(40);

  const { data: employees } = await supabase
    .from("employees")
    .select("code, name, desk, prompt, provider, model, schedule, enabled")
    .order("code");

  const employeesBlock = (employees ?? [])
    .map(
      (e) =>
        `${e.code} ${e.name} (${e.desk}, ${e.enabled ? "enabled" : "disabled"}, ${e.provider}${e.model ? "/" + e.model : ""}${e.schedule ? ", cron: " + e.schedule : ""})` +
        (e.prompt ? `\n  current prompt: ${e.prompt}` : "\n  (no prompt set)"),
    )
    .join("\n\n");

  const systemPrompt =
    "You are M-00, Chief of Staff for Adarsh's personal Creator OS -- a 13-employee AI newsroom " +
    "for his Instagram content. You manage the team; you don't write reels yourself. Talk to him " +
    "plainly, Hinglish is fine, keep replies short.\n\n" +
    "The current team:\n" +
    employeesBlock +
    "\n\nWhen he gives clear feedback on a named employee or desk (\"Hook Writer is too soft\", " +
    "\"turn off Trend Scout\"), use the propose_employee_change tool to draft ONE specific change " +
    "with a one-line rationale -- never more than one proposal per employee per turn, and never " +
    "apply anything yourself, only propose. For anything else (status questions, general chat, " +
    "something you don't have enough information to act on), just reply in text and ask a " +
    "clarifying question if needed.";

  const messages = (history ?? []).map((m) => ({
    role: m.role === "manager" ? "assistant" : "user",
    content: m.content,
  }));

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      output_config: { effort: "medium" },
      system: systemPrompt,
      tools: [PROPOSE_TOOL],
      messages,
    }),
  });

  if (!anthropicRes.ok) {
    return json(req, { error: `Anthropic error: ${await anthropicRes.text()}` }, 502);
  }

  const result = await anthropicRes.json();
  const content = (result.content ?? []) as ContentBlock[];
  const replyText = content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const toolCalls = content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, string> } => b.type === "tool_use");

  const { data: managerMsg, error: insertManagerErr } = await supabase
    .from("manager_messages")
    .insert({ role: "manager", content: replyText || "(proposed a change below)" })
    .select("id")
    .single();
  if (insertManagerErr) return json(req, { error: insertManagerErr.message }, 500);

  const employeeByCode = new Map((employees ?? []).map((e) => [e.code, e]));
  const proposals: Record<string, unknown>[] = [];

  for (const call of toolCalls) {
    if (call.name !== "propose_employee_change") continue;
    const { employee_code, field, new_value, rationale } = call.input;
    const employee = employeeByCode.get(employee_code);
    if (!employee) continue;

    const { data: fullEmployee } = await supabase
      .from("employees")
      .select("id")
      .eq("code", employee_code)
      .single();
    if (!fullEmployee) continue;

    const oldValue =
      field === "enabled" ? String(employee.enabled) : (employee as Record<string, unknown>)[field] ?? null;

    const { data: proposal, error: proposalErr } = await supabase
      .from("manager_proposals")
      .insert({
        message_id: managerMsg.id,
        employee_id: fullEmployee.id,
        field,
        old_value: oldValue !== null ? String(oldValue) : null,
        new_value,
        rationale,
      })
      .select("*, employees(code, name)")
      .single();
    if (!proposalErr && proposal) proposals.push(proposal);
  }

  return json(req, {
    reply: replyText || "(No reply text -- see the proposal below.)",
    proposals,
    userMessageId: userMsg.id,
  });
});
