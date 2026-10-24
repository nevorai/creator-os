// Brand training chat. The creator pastes transcripts / captions and answers a few questions; the
// Brand Brain (pillars, hook formula, voice notes, rules, language register) is built from the
// conversation instead of from a form.
//   action "message"  one chat turn (1 AI credit)
//   action "build"    read the whole conversation and write the Brand Brain (2 AI credits)
//   action "reset"    clear the conversation (owner only)
import { corsHeadersFor, json } from "../_shared/cors.ts";
import { aiKey, guard, spend } from "../_shared/tenant.ts";

const MODEL = "claude-sonnet-5";
// Overridable only through the function's own environment (used by the local test harness).
const ANTHROPIC_URL = Deno.env.get("ANTHROPIC_API_URL") ?? "https://api.anthropic.com/v1/messages";
const MAX_HISTORY_CHARS = 120_000;

const INTERVIEWER =
  "You are the Brand Trainer inside a creator's private workspace. Your job is to learn how THIS creator " +
  "talks and what they stand for, so their AI team can write in their voice. The creator will paste " +
  "transcripts, captions or scripts and answer your questions.\n\n" +
  "Rules:\n" +
  "- Reply in the language the creator writes in (English, Hindi or Hinglish), in plain simple words.\n" +
  "- Ask at most TWO short questions per turn. Never a long list.\n" +
  "- When they paste content, say in 2-3 lines what you noticed about their voice (sentence length, " +
  "words they repeat, how they open, how they argue, how they end), quoting short phrases from their own text.\n" +
  "- Over the conversation cover: their niche and who they speak to; their 3-6 content pillars; how they " +
  "open a reel; words/phrases that are theirs; things they never say or claim (rules); how formal or " +
  "rough their language is. Do not ask what they already told you.\n" +
  "- Never invent facts about them. If unsure, ask.\n" +
  "- After roughly 5 good exchanges (or when they paste several transcripts), tell them they can press " +
  "'Build my Brand Brain' now.";

const BUILDER =
  "From the conversation below, write this creator's Brand Brain. Output STRICT JSON only, no markdown: " +
  '{"pillars": [3 to 6 short strings], "hook_formula": "how their best hooks are built, 1-3 sentences, with 2 real examples from their own text if any", ' +
  '"voice_notes": "6-12 lines: sentence length, signature words and phrases (quote them), how they open and close, tone, language mix, what makes them sound like them", ' +
  '"banned_claims": "rules: things never to say or claim, topics to avoid, from what they told you; empty string if none were given", ' +
  '"language_register": "clean" | "mixed" | "crude"}. ' +
  "Use ONLY what the creator actually said or pasted. Do not invent pillars or rules. If something was not covered, use an empty string or a short pillar list.";

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json(req, { error: "POST only." }, 405);
  let body: { action?: string; text?: string };
  try { body = await req.json(); } catch { return json(req, { error: "Send JSON." }, 400); }

  const g = await guard(req, body.action === "reset" ? "owner" : "write");
  if (g instanceof Response) return g;
  const { db, tenantId } = g;

  if (body.action === "reset") {
    await db.from("brand_chat").delete().eq("tenant_id", tenantId);
    return json(req, { ok: true });
  }
  if (body.action !== "message" && body.action !== "build") return json(req, { error: "Unknown action." }, 400);

  const k = await aiKey(db, tenantId);
  if (!k) return json(req, { error: "No AI key is set up yet. Add one in Settings, or ask Nevorai." }, 400);

  if (body.action === "message") {
    const text = (body.text ?? "").trim();
    if (!text) return json(req, { error: "Type or paste something first." }, 400);
    if (text.length > 40_000) return json(req, { error: "That is too long for one message. Paste it in two parts." }, 400);
    const capped = await spend(req, g, k, 1);
    if (capped) return capped;
    const { error: e1 } = await db.from("brand_chat").insert({ tenant_id: tenantId, role: "user", content: text });
    if (e1) return json(req, { error: "Could not save your message." }, 500);
    const reply = await ask(k.key, INTERVIEWER, await history(db, tenantId), 900, true);
    if (typeof reply !== "string") return json(req, { error: reply.error }, 502);
    await db.from("brand_chat").insert({ tenant_id: tenantId, role: "assistant", content: reply });
    return json(req, { reply });
  }

  // build
  const msgs = await history(db, tenantId);
  if (!msgs.some((m) => m.role === "user")) return json(req, { error: "Talk to the Brand Trainer first." }, 400);
  const capped = await spend(req, g, k, 2);
  if (capped) return capped;
  const transcript = msgs.map((m) => `${m.role === "user" ? "CREATOR" : "TRAINER"}: ${m.content}`).join("\n\n");
  const out = await ask(k.key, BUILDER, [{ role: "user", content: transcript }], 1800, false);
  if (typeof out !== "string") return json(req, { error: out.error }, 502);
  let parsed: Record<string, unknown>;
  try {
    const m = out.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : out);
  } catch {
    return json(req, { error: "Could not read the result. Try again." }, 502);
  }
  const pillars = Array.isArray(parsed.pillars) ? parsed.pillars.map((p) => String(p).slice(0, 80)).slice(0, 8) : [];
  const reg = ["clean", "mixed", "crude"].includes(String(parsed.language_register)) ? String(parsed.language_register) : null;
  const row = {
    tenant_id: tenantId, id: 1, pillars,
    hook_formula: String(parsed.hook_formula ?? "").slice(0, 3000) || null,
    voice_notes: String(parsed.voice_notes ?? "").slice(0, 6000) || null,
    banned_claims: String(parsed.banned_claims ?? "").slice(0, 3000) || null,
    language_register: reg, updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("brand_brain").upsert(row);
  if (error) return json(req, { error: "Could not save the Brand Brain." }, 500);
  return json(req, { brand: row });
});

async function history(db: Awaited<ReturnType<typeof import("../_shared/tenant.ts").serviceClient>>, tenantId: string): Promise<Msg[]> {
  const { data } = await db.from("brand_chat").select("role, content").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(60);
  const rows = ((data ?? []) as Msg[]).reverse();
  // Keep the newest messages that fit the budget.
  let total = 0;
  const kept: Msg[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    total += rows[i].content.length;
    if (total > MAX_HISTORY_CHARS) break;
    kept.unshift(rows[i]);
  }
  while (kept.length && kept[0].role !== "user") kept.shift();
  return kept;
}

async function ask(key: string, system: string, messages: Msg[], maxTokens: number, cache: boolean): Promise<string | { error: string }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, output_config: { effort: "low" },
      system: cache ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : system,
      messages,
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null);
  if (!res) return { error: "The AI took too long. Try again." };
  if (!res.ok) return { error: "The AI service refused this request. Try again in a minute." };
  const r = await res.json();
  const text = (r.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text?: string }) => b.text ?? "").join("\n").trim();
  return text || { error: "The AI returned nothing. Try again." };
}
