// C-01 Topic Planner. On-demand: reads recent outlier posts from Influencer
// Watch + recent headlines from the News Desk, plus Brand Brain pillars, and
// asks Claude to turn raw signal into a short ranked list of reel topics.
// Saved to `ideas` so they persist instead of being re-derived every visit.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor, json } from "../_shared/cors.ts";
import { ownerOnly } from "../_shared/owner.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  const { data: employee } = await supabase
    .from("employees")
    .select("prompt, model")
    .eq("code", "C-01")
    .maybeSingle();

  const { data: brand } = await supabase.from("brand_brain").select("pillars").eq("id", 1).single();

  const { data: outliers } = await supabase
    .from("watchlist_posts")
    .select("caption, views, outlier_ratio, watchlist_accounts(handle, wing)")
    .eq("is_outlier", true)
    .order("outlier_ratio", { ascending: false })
    .limit(10);

  const { data: news } = await supabase
    .from("news_stories")
    .select("title, url")
    .order("fetched_at", { ascending: false })
    .limit(15);

  if ((!outliers || outliers.length === 0) && (!news || news.length === 0)) {
    return json(
      req,
      {
        error:
          "No raw material yet — no outlier posts and no news headlines. Add Watchlist accounts or Sources, or wait for tonight's runs.",
      },
      400,
    );
  }

  type OutlierRow = { caption: string | null; views: number | null; outlier_ratio: number | null; watchlist_accounts: { handle: string; wing: string | null } | null };
  const outlierBlock =
    (outliers as OutlierRow[] | null ?? [])
      .map(
        (o) =>
          `- @${o.watchlist_accounts?.handle ?? "?"} (${o.watchlist_accounts?.wing ?? "?"}): "${(o.caption ?? "").slice(0, 120)}" — ${o.views ?? "?"} views, ${o.outlier_ratio?.toFixed(1) ?? "?"}x their median`,
      )
      .join("\n") || "(none)";

  const newsBlock =
    (news ?? []).map((n) => `- ${n.title} (${n.url})`).join("\n") || "(none)";

  const systemPrompt =
    "You are the Topic Planner employee (C-01) inside Adarsh's personal Creator OS.\n\n" +
    `His pillars: ${(brand?.pillars ?? []).join(", ")}\n\n` +
    (employee?.prompt ? `Instructions: ${employee.prompt}\n\n` : "") +
    "Output STRICT JSON only — an array of up to 5 objects, each shaped exactly like: " +
    '{"topic": "...", "pillar": "...", "why_now": "...", "confidence": "high"|"medium"|"low", "source": "..."}. ' +
    "No markdown, no prose outside the JSON array, no trailing commentary.";

  const userPrompt =
    `Outlier posts from watched accounts (recent):\n${outlierBlock}\n\n` +
    `Recent headlines:\n${newsBlock}\n\n` +
    "Turn this into up to 5 ranked reel topic ideas for Adarsh's own page.";

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: employee?.model || "claude-sonnet-5",
      max_tokens: 2000,
      output_config: { effort: "medium" },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!anthropicRes.ok) {
    return json(req, { error: `Anthropic error: ${await anthropicRes.text()}` }, 502);
  }

  const result = await anthropicRes.json();
  const text = (result.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text?: string }) => b.text ?? "")
    .join("\n");

  let parsed: Array<Record<string, unknown>>;
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return json(req, { error: `Could not parse ideas from the model's response: ${text.slice(0, 300)}` }, 502);
  }

  const rows = parsed
    .slice(0, 5)
    .map((p) => ({
      topic: String(p.topic ?? "").slice(0, 500),
      pillar: p.pillar ? String(p.pillar).slice(0, 100) : null,
      why_now: p.why_now ? String(p.why_now).slice(0, 500) : null,
      confidence: ["high", "medium", "low"].includes(String(p.confidence)) ? String(p.confidence) : null,
      source: p.source ? String(p.source).slice(0, 300) : null,
    }))
    .filter((r) => r.topic);

  if (rows.length === 0) {
    return json(req, { error: "Model returned no usable ideas. Try again." }, 502);
  }

  const { data: inserted, error: insertErr } = await supabase.from("ideas").insert(rows).select();
  if (insertErr) return json(req, { error: insertErr.message }, 500);

  return json(req, { ideas: inserted });
});
