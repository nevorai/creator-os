// Nightly RSS pull. Reads active rows from `sources`, fetches each feed,
// upserts new items into `news_stories`. No AI scoring here — that needs
// Anthropic/Gemini keys, which are a later step (see STATUS.md).
// Only the pg_cron job (service role key) or a signed-in owner may run it,
// see _shared/owner.ts.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { scheduleOrOwner } from "../_shared/owner.ts";
import { safeFetchText } from "../_shared/safe-fetch.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "creator_os" } },
);

function parseFeedItems(xml: string) {
  const items: { title: string; url: string; published_at: string | null }[] = [];
  const itemRe = /<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/g;
  const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/;
  const linkRe = /<link[^>]*>([\s\S]*?)<\/link>|<link[^>]*href="([^"]*)"/;
  const dateRe = /<pubDate>([\s\S]*?)<\/pubDate>|<published>([\s\S]*?)<\/published>/;

  const matches = xml.match(itemRe) ?? [];
  for (const raw of matches) {
    const title = titleRe.exec(raw)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const linkMatch = linkRe.exec(raw);
    const url = (linkMatch?.[1] || linkMatch?.[2])?.trim();
    const dateMatch = dateRe.exec(raw);
    const dateStr = dateMatch?.[1] || dateMatch?.[2];
    if (title && url) {
      items.push({
        title,
        url,
        published_at: dateStr ? new Date(dateStr).toISOString() : null,
      });
    }
  }
  return items;
}

Deno.serve(async (req) => {
  const denied = await scheduleOrOwner(req);
  if (denied) return denied;

  const { data: sources, error: sourcesError } = await supabase
    .from("sources")
    .select("id, url, tenant_id, niche_id, tenants!inner(status)")
    .eq("active", true)
    .eq("tenants.status", "active");

  if (sourcesError) {
    return new Response(JSON.stringify({ error: sourcesError.message }), { status: 500 });
  }

  let inserted = 0;
  const errors: string[] = [];

  for (const source of sources ?? []) {
    try {
      const xml = await safeFetchText(source.url, { "User-Agent": "NevoraiCreator/1.0" });
      const items = parseFeedItems(xml).slice(0, 30);

      if (items.length === 0) continue;

      const { error: upsertError } = await supabase
        .from("news_stories")
        .upsert(
          items.map((item) => ({ ...item, source_id: source.id, tenant_id: source.tenant_id, niche_id: source.niche_id })),
          { onConflict: "tenant_id,url", ignoreDuplicates: true },
        );

      if (upsertError) {
        errors.push(`${source.url}: ${upsertError.message}`);
      } else {
        inserted += items.length;
      }
    } catch (e) {
      errors.push(`${source.url}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ sources: sources?.length ?? 0, processed: inserted, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
