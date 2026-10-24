// Given an Instagram reel URL, calls Apify's Instagram scraper to pull
// metrics + caption, then saves it either to `reels` (his own posts) or
// `watchlist_posts` (a competitor account already on the Watchlist).
//
// Needs the APIFY_API_TOKEN Edge Function secret — set by Adarsh himself,
// never by Claude (see README for the exact command). Until it's set this
// function returns a clear 400 instead of failing silently.
import { corsHeadersFor, json } from "../_shared/cors.ts";
import { guard } from "../_shared/tenant.ts";

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const APIFY_ACTOR = "apify~instagram-scraper";

type Body = {
  url: string;
  kind: "own" | "competitor";
  account_id?: string; // required when kind === "competitor"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });

  // Writes rows and spends Apify credits: a member who may write, in the workspace they name.
  const g = await guard(req, "write");
  if (g instanceof Response) return g;
  const supabase = g.db;
  const tid = g.tenantId;

  if (!APIFY_TOKEN) {
    return json(req, { error: "APIFY_API_TOKEN is not set. See README for how to add it." }, 400);
  }

  const body = (await req.json()) as Body;
  if (!body.url) {
    return json(req, { error: "url is required" }, 400);
  }
  if (!/^https:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[A-Za-z0-9_-]+/.test(body.url)) {
    return json(req, { error: "Paste an Instagram reel or post link." }, 400);
  }
  if (body.kind === "competitor" && !body.account_id) {
    return json(req, { error: "account_id is required for kind=competitor" }, 400);
  }

  if (body.kind === "competitor") {
    const { data: acct } = await supabase.from("watchlist_accounts").select("id").eq("id", body.account_id!).eq("tenant_id", tid).maybeSingle();
    if (!acct) return json(req, { error: "That account is not on your Watchlist." }, 403);
  }

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directUrls: [body.url], resultsType: "posts", resultsLimit: 1 }),
    },
  );

  if (!runRes.ok) {
    return json(req, { error: `Apify error: ${await runRes.text()}` }, 502);
  }

  const items = await runRes.json();
  const item = items?.[0];
  if (!item) {
    return json(req, { error: "Apify returned no data for this URL" }, 502);
  }

  const posted_at = item.timestamp ? new Date(item.timestamp).toISOString().slice(0, 10) : null;
  const caption = item.caption ?? null;
  const views = item.videoPlayCount ?? item.videoViewCount ?? null;
  const likes = item.likesCount ?? null;
  const comments = item.commentsCount ?? null;

  if (body.kind === "own") {
    const { error } = await supabase.from("reels").insert({
      tenant_id: tid,
      posted_at,
      transcript: caption ?? "",
      caption,
      source: "manual",
      is_organic: true,
      views,
      likes,
      comments,
      notes: `Ingested from ${body.url}`,
    });
    if (error) return json(req, { error: error.message }, 500);
  } else {
    const { error } = await supabase.from("watchlist_posts").upsert(
      {
        tenant_id: tid,
        account_id: body.account_id,
        post_url: body.url,
        posted_at,
        caption,
        views,
        likes,
        comments,
      },
      { onConflict: "tenant_id,post_url" },
    );
    if (error) return json(req, { error: error.message }, 500);
  }

  return json(req, { ok: true, views, likes, comments });
});
