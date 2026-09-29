// Influencer Watch desk. Lifted from ~/above1million's scrape-reels function
// per CLAUDE.md's explicit instruction not to write this twice — same actor
// call shape as ingest-instagram (already proven working in this project)
// rather than above1million's actor, so both functions depend on one Apify
// actor Adarsh's account is already using.
//
// For every active watchlist account: pull their recent posts via Apify,
// upsert into watchlist_posts, then flag outliers as >= 3x that account's
// own trailing-30-day median views — never an absolute threshold, since a
// 5k-median account and a 500k-median account don't share a bar. This is
// the exact rule already promised in the Watchlist screen's copy.
//
// Meant to run on a schedule (see migration 0009) with the service role key.
// Only that key or a signed-in owner may start it (every run spends Apify
// credits), see _shared/owner.ts.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { scheduleOrOwner } from "../_shared/owner.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "creator_os" },
});

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const APIFY_ACTOR = "apify~instagram-scraper"; // same actor ingest-instagram already uses
const RESULTS_PER_ACCOUNT = Number(Deno.env.get("WATCHLIST_RESULTS_PER_ACCOUNT") ?? "5");
const OUTLIER_MULTIPLE = 3;

type ApifyItem = {
  url?: string;
  ownerUsername?: string;
  caption?: string;
  timestamp?: string;
  videoPlayCount?: number;
  videoViewCount?: number;
  likesCount?: number;
  commentsCount?: number;
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

Deno.serve(async (req) => {
  const denied = await scheduleOrOwner(req);
  if (denied) return denied;

  if (!APIFY_TOKEN) {
    return new Response(
      JSON.stringify({ error: "APIFY_API_TOKEN is not set. Add it as an Edge Function secret." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data: accounts, error: accountsErr } = await supabase
    .from("watchlist_accounts")
    .select("id, handle")
    .eq("active", true);
  if (accountsErr) {
    return new Response(JSON.stringify({ error: accountsErr.message }), { status: 500 });
  }
  if (!accounts || accounts.length === 0) {
    return new Response(JSON.stringify({ accounts: 0, posts: 0, outliers: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const handleToId = new Map(accounts.map((a) => [a.handle.toLowerCase(), a.id]));
  const directUrls = accounts.map((a) => `https://www.instagram.com/${a.handle}/`);

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls,
        resultsType: "posts",
        resultsLimit: RESULTS_PER_ACCOUNT,
      }),
    },
  );

  if (!runRes.ok) {
    return new Response(JSON.stringify({ error: `Apify error: ${await runRes.text()}` }), {
      status: 502,
    });
  }

  const items = (await runRes.json()) as ApifyItem[];
  let upserted = 0;
  const errors: string[] = [];
  const touchedAccountIds = new Set<string>();

  for (const item of items) {
    if (!item.url || !item.ownerUsername) continue;
    const accountId = handleToId.get(item.ownerUsername.toLowerCase());
    if (!accountId) continue; // post from a redirect/tagged account, not one we're tracking

    const views = item.videoPlayCount ?? item.videoViewCount ?? 0;
    const { error } = await supabase.from("watchlist_posts").upsert(
      {
        account_id: accountId,
        post_url: item.url,
        posted_at: item.timestamp ? new Date(item.timestamp).toISOString().slice(0, 10) : null,
        caption: item.caption ?? null,
        views,
        likes: item.likesCount ?? null,
        comments: item.commentsCount ?? null,
      },
      { onConflict: "post_url" },
    );
    if (error) {
      errors.push(`${item.url}: ${error.message}`);
      continue;
    }
    upserted += 1;
    touchedAccountIds.add(accountId);
  }

  // Second pass: recompute each touched account's own 30-day median and flag
  // outliers. Done after all upserts so the median includes today's posts too.
  let outliers = 0;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const accountId of touchedAccountIds) {
    const { data: recent, error: recentErr } = await supabase
      .from("watchlist_posts")
      .select("id, views")
      .eq("account_id", accountId)
      .gte("posted_at", thirtyDaysAgo);
    if (recentErr || !recent) continue;

    const views = recent.map((r) => r.views ?? 0).filter((v) => v > 0);
    const m = median(views);
    if (m === null || m === 0) continue;

    for (const row of recent) {
      const isOutlier = (row.views ?? 0) >= m * OUTLIER_MULTIPLE;
      if (isOutlier) outliers += 1;
      await supabase
        .from("watchlist_posts")
        .update({ is_outlier: isOutlier, outlier_ratio: row.views ? row.views / m : null })
        .eq("id", row.id);
    }
  }

  return new Response(
    JSON.stringify({ accounts: accounts.length, posts: upserted, outliers, errors }),
    { headers: { "Content-Type": "application/json" }, status: errors.length ? 207 : 200 },
  );
});
