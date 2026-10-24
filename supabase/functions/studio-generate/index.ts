// Studio's three AI employees: a lightweight I-04 Deep Research pass, then
// C-02 Hook Writer and C-03 Scriptwriter.
//
// Reads the Anthropic key and the Brand Brain from the database (this is what
// Settings' key-save feature was built for), never from an Edge Function
// secret. Model is Sonnet 5 for all three — hooks and scripts are the two
// highest-leverage, viewer-facing outputs in the whole system, so quality
// beats the small savings Haiku would offer here. Haiku is the right choice
// for later, more mechanical employees (Packaging Writer, bulk classification).
//
// IMPORTANT: hooks and scripts must never invent a specific fact, number,
// name, or quote. Adarsh caught the model doing exactly that (a fabricated
// claim about a real politician and two real companies) before he posted it.
// The fix: a mandatory research step runs first, using Claude's live web
// search, and its output is the ONLY source of specific facts the writers
// are allowed to use — enforced by instruction, and the research text is
// always returned to the browser so he can check the sources himself before
// he ever says a line on camera.
import { corsHeadersFor, json } from "../_shared/cors.ts";
import { aiKey, guard, spend } from "../_shared/tenant.ts";

type Body =
  | { action: "research"; topic: string }
  | { action: "hooks"; topic: string; research?: string }
  | { action: "script"; topic: string; hook: string; research?: string };

function extractText(content: Array<{ type: string; text?: string }>): string {
  // A response that used web search can carry several text blocks
  // interleaved with search-result blocks — join all of them, not just
  // the first, or the end of the answer silently goes missing.
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });

  // Signed in and a member of THIS creator's workspace, with a role that may write.
  const g = await guard(req, "write");
  if (g instanceof Response) return g;
  const supabase = g.db;

  const k = await aiKey(supabase, g.tenantId);
  if (!k) {
    return json(req, { error: "No AI key is set up yet. Add one in Settings, or ask Nevorai." }, 400);
  }
  const apiKey = k.key;
  const capped = await spend(req, g, k);
  if (capped) return capped;

  const body = (await req.json()) as Body;
  if (!body.topic?.trim()) {
    return json(req, { error: "topic is required" }, 400);
  }

  // Employees are database rows, not code files (CLAUDE.md's core rule) —
  // read I-04/C-02/C-03's prompt + model from the employees table, falling
  // back to the hardcoded text below only when a row's prompt is empty, so
  // this keeps working even before 0010 is run or if a row gets cleared.
  const { data: employeeRows } = await supabase
    .from("employees")
    .select("code, prompt, model")
    .eq("tenant_id", g.tenantId)
    .in("code", ["I-04", "C-02", "C-03"]);
  const employeeByCode = new Map((employeeRows ?? []).map((e) => [e.code, e]));

  // --- Research: no Brand Brain, no voice — this is a fact-finding call only. ---
  if (body.action === "research") {
    const researcher = employeeByCode.get("I-04");
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: researcher?.model || "claude-sonnet-5",
        max_tokens: 8000,
        // Search-and-summarize doesn't need deep reasoning — "low" effort is
        // both faster and cheaper here, and speed is what this call needed.
        output_config: { effort: "low" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
        system:
          researcher?.prompt ||
          "You are a fact-checker. Search the web for real, verifiable facts about the topic " +
          "given. Return a plain numbered list. Every line must end with the source URL in " +
          "parentheses. Do not include anything you could not find a source for. If you find " +
          "little or nothing solid, say so plainly instead of filling space.",
        messages: [{ role: "user", content: `Topic: ${body.topic}` }],
      }),
    });
    if (!anthropicRes.ok) {
      return json(req, { error: `Anthropic error: ${await anthropicRes.text()}` }, 502);
    }
    const result = await anthropicRes.json();
    const text = extractText(result.content ?? []);
    // A truncated or empty response used to render as a silent blank screen —
    // this is what Adarsh hit. Raised max_tokens (3 searches can burn a lot of
    // the budget before writing the answer) and now this fails loud instead.
    if (!text.trim()) {
      return json(req, 
        { error: `Research produced no usable text (stop_reason: ${result.stop_reason}). Try a narrower topic, or try again.` },
        502,
      );
    }
    return json(req, { text });
  }

  // --- Hooks / Script: Brand Brain applies, and only the research's facts are allowed. ---
  const { data: brand } = await supabase
    .from("brand_brain")
    .select("pillars, hook_formula, voice_notes, banned_claims")
    .eq("tenant_id", g.tenantId)
    .maybeSingle();
  const { data: who } = await supabase
    .from("tenant_profile")
    .select("display_name, niche, language")
    .eq("tenant_id", g.tenantId)
    .maybeSingle();

  const brandBrainBlock = [
    `Pillars: ${(brand?.pillars ?? []).join(", ")}`,
    `Hook formula: ${brand?.hook_formula ?? "(not set)"}`,
    `Voice profile: ${brand?.voice_notes ?? "(not set)"}`,
    brand?.banned_claims ? `Rules: ${brand.banned_claims}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const systemPrompt =
    `You are the scriptwriting employee inside ${who?.display_name ?? "this creator"}'s private Creator workspace` +
    (who?.niche ? ` (niche: ${who.niche})` : "") +
    (who?.language ? `; write in ${who.language}` : "") +
    ". Everything below is their own voice profile and rules, learned from their real content — follow it exactly, don't " +
    "default to generic AI-influencer phrasing.\n\n" +
    brandBrainBlock +
    "\n\nHARD RULE: never state a specific number, date, name, quote, or case as fact unless it " +
    "appears in the verified research the user provides. If no research is provided, or the " +
    "research doesn't cover something you'd otherwise want to claim, write around it in general " +
    "terms instead of inventing a specific. Making up a convincing-sounding fact is the single " +
    "worst failure mode for this job — worse than a weaker hook.";

  const researchBlock = body.research?.trim()
    ? `Verified research for this topic (the ONLY source of specific facts you may use):\n${body.research}\n\n`
    : "No research was provided for this topic — do not state any specific fact, number, name, " +
      "or quote as true. Keep the content general.\n\n";

  let userPrompt: string;
  let maxTokens: number;
  let employeeCode: "C-02" | "C-03";
  if (body.action === "hooks") {
    employeeCode = "C-02";
    userPrompt =
      researchBlock +
      `Topic: ${body.topic}\n\n` +
      "Write 8 hooks for a reel on this topic, following the hook formula above exactly. " +
      "Tag each one [WIDE REACH] or [HIGH INTENT]. Number them 1-8, one per line, hook text only " +
      "after the tag — no extra commentary.";
    maxTokens = 1200;
  } else {
    if (!body.hook?.trim()) {
      return json(req, { error: "hook is required for action=script" }, 400);
    }
    employeeCode = "C-03";
    userPrompt =
      researchBlock +
      `Topic: ${body.topic}\nChosen hook: ${body.hook}\n\n` +
      "Write the full 60-90 second reel script that pays off this hook, following the voice " +
      "profile and beat structure above exactly. Mark pause/emphasis cues in [brackets]. End with " +
      "a share line and a CTA. Output the script only — no preamble, no explanation.";
    maxTokens = 2000;
  }

  // The employee row's prompt is additional instruction from Adarsh, layered
  // on top of the Brand Brain + anti-fabrication rule above — those two stay
  // hardcoded on purpose so an admin-panel edit can never remove the safety
  // rule, but tone/behaviour is his to tune without a deploy.
  const employee = employeeByCode.get(employeeCode);
  const fullSystemPrompt = employee?.prompt
    ? `${systemPrompt}\n\nAdditional instructions for this employee (${employeeCode}):\n${employee.prompt}`
    : systemPrompt;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: employee?.model || "claude-sonnet-5",
      max_tokens: maxTokens,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: fullSystemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return json(req, { error: `Anthropic error: ${errText}` }, 502);
  }

  const result = await anthropicRes.json();
  const text = extractText(result.content ?? []);
  if (!text.trim()) {
    return json(req, 
      { error: `${body.action} produced no usable text (stop_reason: ${result.stop_reason}). Try again.` },
      502,
    );
  }
  return json(req, { text });
});
