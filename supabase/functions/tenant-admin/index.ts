// Workspace admin for one creator (tenant). Everything a browser may NOT write directly goes through here:
//   onboard       owner   first-time profile (name, niche, handle, language)
//   save_key      owner   the creator's own AI key (optional; otherwise Nevorai's key + monthly credits)
//   remove_key    owner
//   add_member    owner   invite a teammate by email as editor or viewer (seat limit enforced by the database)
//   set_role      owner   editor <-> viewer
//   remove_member owner
//   billing_url   owner   one-time pass that opens billing.nevorai.com already signed in
// The tenant comes from the signed-in user's membership (x-tenant-id header), never from the request body.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor, json } from "../_shared/cors.ts";
import { guard } from "../_shared/tenant.ts";
import { makePass } from "../_shared/kaizen.ts";

const APP_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://creator.nevorai.com").replace(/\/$/, "");
const BILLING = (Deno.env.get("KAIZEN_BILLING_URL") ?? "https://billing.nevorai.com").replace(/\/$/, "");
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

type Body = Record<string, unknown> & { action?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json(req, { error: "POST only." }, 405);

  let body: Body;
  try { body = await req.json(); } catch { return json(req, { error: "Send JSON." }, 400); }
  const action = body.action ?? "";

  const g = await guard(req, "owner");
  if (g instanceof Response) {
    // billing_url must keep working for a paused workspace (that is where they pay), so re-check as read-only owner.
    if (action !== "billing_url" || g.status !== 402) return g;
  }
  const gg = g instanceof Response ? await ownerEvenIfPaused(req) : g;
  if (gg instanceof Response) return gg;
  const { db, tenantId, userId } = gg;

  switch (action) {
    case "onboard": {
      const display_name = str(body.display_name, 120);
      if (!display_name) return json(req, { error: "Tell us your name." }, 400);
      const language = ["english", "hindi", "hinglish"].includes(String(body.language)) ? String(body.language) : "hinglish";
      const { error } = await db.from("tenant_profile").upsert({
        tenant_id: tenantId, display_name, niche: str(body.niche, 200) || null,
        handle: str(body.handle, 60).replace(/^@/, "") || null, language, about: str(body.about, 1000) || null,
        onboarded_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) return json(req, { error: error.message }, 500);
      await db.from("tenants").update({ name: display_name }).eq("id", tenantId);
      return json(req, { ok: true });
    }

    case "save_key": {
      const provider = body.provider === "gemini" ? "gemini" : body.provider === "anthropic" ? "anthropic" : null;
      const key = typeof body.key === "string" ? body.key.trim() : "";
      if (!provider || key.length < 20 || key.length > 300 || /\s/.test(key)) return json(req, { error: "That does not look like a valid key." }, 400);
      if (provider === "anthropic" && !key.startsWith("sk-ant-")) return json(req, { error: "Anthropic keys start with sk-ant-." }, 400);
      const col = provider === "anthropic" ? "anthropic_api_key" : "gemini_api_key";
      const { error } = await db.from("tenant_secrets").upsert({ tenant_id: tenantId, [col]: key, updated_at: new Date().toISOString() });
      if (error) return json(req, { error: "Could not save the key." }, 500);
      await db.from("app_settings").update({ [`${provider}_key_set`]: true, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
      return json(req, { ok: true });
    }

    case "remove_key": {
      const provider = body.provider === "gemini" ? "gemini" : body.provider === "anthropic" ? "anthropic" : null;
      if (!provider) return json(req, { error: "Which key?" }, 400);
      const col = provider === "anthropic" ? "anthropic_api_key" : "gemini_api_key";
      await db.from("tenant_secrets").update({ [col]: null }).eq("tenant_id", tenantId);
      await db.from("app_settings").update({ [`${provider}_key_set`]: false }).eq("tenant_id", tenantId);
      return json(req, { ok: true });
    }

    case "add_member": {
      const email = str(body.email, 254).toLowerCase();
      const role = body.role === "viewer" ? "viewer" : "editor";
      if (!EMAIL.test(email)) return json(req, { error: "Enter a valid email." }, 400);
      let uid: string | null = (await db.rpc("user_id_by_email", { e: email })).data ?? null;
      if (!uid) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL });
        if (error || !data?.user) return json(req, { error: "Could not send the invite." }, 502);
        uid = data.user.id;
      }
      const { error } = await db.from("tenant_members").insert({ tenant_id: tenantId, user_id: uid, role });
      if (error) {
        if (error.code === "23505") return json(req, { error: "They are already on your team." }, 409);
        if (/Plan limit/i.test(error.message)) return json(req, { error: "Your plan's team seats are full." }, 402);
        return json(req, { error: "Could not add them." }, 500);
      }
      return json(req, { ok: true });
    }

    case "set_role":
    case "remove_member": {
      const target = typeof body.user_id === "string" ? body.user_id : "";
      if (!/^[0-9a-f-]{36}$/i.test(target)) return json(req, { error: "Which person?" }, 400);
      if (target === userId) return json(req, { error: "You cannot change your own access." }, 400);
      const { data: m } = await db.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("user_id", target).maybeSingle();
      if (!m) return json(req, { error: "Not on your team." }, 404);
      if (m.role === "owner") return json(req, { error: "Owners can only be changed by Nevorai." }, 403);
      if (action === "remove_member") {
        await db.from("tenant_members").delete().eq("tenant_id", tenantId).eq("user_id", target);
      } else {
        const role = body.role === "viewer" ? "viewer" : "editor";
        await db.from("tenant_members").update({ role }).eq("tenant_id", tenantId).eq("user_id", target);
      }
      return json(req, { ok: true });
    }

    case "billing_url": {
      const secret = Deno.env.get("KAIZEN_PROVISION_SECRET");
      if (!secret) return json(req, { error: "Billing is not switched on yet." }, 503);
      const { data: t } = await db.from("tenants").select("name, billing_source").eq("id", tenantId).single();
      if (t?.billing_source !== "kaizen") return json(req, { error: "This workspace is billed by hand. Ask Nevorai." }, 409);
      const email = (await db.auth.admin.getUserById(userId)).data.user?.email;
      if (!email) return json(req, { error: "No email on this login." }, 400);
      const plan = typeof body.plan === "string" && /^[a-z][a-z0-9_-]{1,30}$/.test(body.plan) ? body.plan : undefined;
      const pass = await makePass({ email, tenantId, business: t.name, plan }, secret);
      return json(req, { url: `${BILLING}/from/creator#t=${pass}` });
    }

    default:
      return json(req, { error: "Unknown action." }, 400);
  }
});

// Same checks as guard(..., "owner") but without the "must be active" rule.
async function ownerEvenIfPaused(req: Request) {
  const g = await guard(req, "read");
  if (g instanceof Response) return g;
  if (g.role !== "owner") return json(req, { error: "Only the owner can do this." }, 403);
  return g;
}
