// Nevorai Kaizen (billing.nevorai.com) calls this, signed. Deploy with --no-verify-jwt: the caller is
// Kaizen, not a signed-in user, and the HMAC signature is the lock.
//   POST /functions/v1/kaizen/provision | suspend | resume | cancel
// Contract: ~/nevorai-kaizen/docs/product-provisioning.md. Creator never charges anyone.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  freshEnough, MAX_BODY, newSlug, parseChange, parseProvision, SIGNATURE_HEADER, verifySignature,
} from "../_shared/kaizen.ts";
import { serviceClient } from "../_shared/tenant.ts";

const SECRET = Deno.env.get("KAIZEN_PROVISION_SECRET");
const APP_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://creator.nevorai.com").replace(/\/$/, "");

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { ok: false, code: "bad_request", error: "POST only." });
  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!["provision", "suspend", "resume", "cancel"].includes(action)) {
    return reply(404, { ok: false, code: "bad_request", error: "Unknown action." });
  }
  if (!SECRET) return reply(503, { ok: false, code: "not_configured", error: "KAIZEN_PROVISION_SECRET is not set." });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply(413, { ok: false, code: "too_big", error: "Body too large." });
  if (!(await verifySignature(raw, req.headers.get(SIGNATURE_HEADER), SECRET))) {
    return reply(401, { ok: false, code: "bad_signature", error: "Bad signature." });
  }
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return reply(400, { ok: false, code: "bad_request", error: "Send JSON." }); }
  if (!freshEnough(body.sent_at)) return reply(400, { ok: false, code: "stale", error: "sent_at is too old or too far ahead." });

  const db = serviceClient();
  const log = (subId: string | null, tenantId: string | null, ok: boolean, code: string | null) =>
    db.from("kaizen_events").insert({ kaizen_subscription_id: subId, action, tenant_id: tenantId, ok, code });

  try {
    if (action === "provision") return await provision(db, body, log);
    return await change(db, action as "suspend" | "resume" | "cancel", body, log);
  } catch (e) {
    console.error("kaizen", action, (e as Error).message);
    await log(typeof body.kaizen_subscription_id === "string" ? body.kaizen_subscription_id : null, null, false, "server_error");
    return reply(500, { ok: false, code: "server_error", error: "Could not complete. Kaizen will retry." });
  }
});

type Db = Awaited<ReturnType<typeof serviceClient>>;
type Log = (s: string | null, t: string | null, ok: boolean, code: string | null) => unknown;

async function provision(db: Db, body: Record<string, unknown>, log: Log): Promise<Response> {
  const p = parseProvision(body);
  if (!p.ok) { await log(null, null, false, "bad_request"); return reply(400, { ok: false, code: "bad_request", error: p.error }); }
  const v = p.v;
  const trialEnds = v.trial === true ? v.trialEndsAt : null;

  // Same subscription again: update the plan, change nothing else. Idempotent.
  const { data: existing } = await db.from("tenants").select("id, status, suspended_by").eq("kaizen_subscription_id", v.subscriptionId).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { plan_key: v.planKey, limits: v.limits, trial_ends_at: trialEnds };
    if (existing.status !== "active" && existing.suspended_by !== "nevorai") { patch.status = "active"; patch.suspended_by = null; }
    await db.from("tenants").update(patch).eq("id", existing.id);
    await log(v.subscriptionId, existing.id, true, null);
    return reply(200, { ok: true, product_tenant_id: existing.id, login_url: APP_URL, state: "active" });
  }

  // The owner picked a plan inside the product: it belongs to THAT workspace, and only its owner may pay for it.
  if (v.productTenantId) {
    const { data: t } = await db.from("tenants").select("id, kaizen_subscription_id, billing_source").eq("id", v.productTenantId).maybeSingle();
    if (!t) { await log(v.subscriptionId, null, false, "unknown_tenant"); return reply(404, { ok: false, code: "unknown_tenant", error: "No such workspace." }); }
    const { data: uid } = await db.rpc("user_id_by_email", { e: v.email });
    const { data: m } = uid
      ? await db.from("tenant_members").select("role").eq("tenant_id", t.id).eq("user_id", uid).maybeSingle()
      : { data: null };
    if (m?.role !== "owner") { await log(v.subscriptionId, t.id, false, "not_owner"); return reply(403, { ok: false, code: "not_owner", error: "Only the owner can pay for this workspace." }); }
    if (t.billing_source === "manual") { await log(v.subscriptionId, t.id, false, "manual_billing"); return reply(409, { ok: false, code: "manual_billing", error: "This workspace is billed by hand." }); }
    await db.from("tenants").update({ kaizen_subscription_id: v.subscriptionId, plan_key: v.planKey, limits: v.limits, trial_ends_at: trialEnds, status: "active", suspended_by: null }).eq("id", t.id);
    await log(v.subscriptionId, t.id, true, "attached");
    return reply(200, { ok: true, product_tenant_id: t.id, login_url: APP_URL, state: "active" });
  }

  // Find or create the login. A new person gets Supabase's "set your password" invite email.
  let userId: string | null = (await db.rpc("user_id_by_email", { e: v.email })).data ?? null;
  if (!userId) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.inviteUserByEmail(v.email, { redirectTo: APP_URL, data: { creator_name: v.name } });
    if (error || !data?.user) {
      await log(v.subscriptionId, null, false, "invite_failed");
      return reply(502, { ok: false, code: "invite_failed", error: "Could not create the login." });
    }
    userId = data.user.id;
  }

  // Someone who cancelled and buys again gets their old workspace back.
  const { data: old } = await db.from("tenant_members").select("tenant_id, tenants!inner(status, billing_source)").eq("user_id", userId).eq("role", "owner").eq("tenants.status", "ended").eq("tenants.billing_source", "kaizen").limit(1);
  if (old && old.length) {
    const tid = old[0].tenant_id as string;
    await db.from("tenants").update({ kaizen_subscription_id: v.subscriptionId, plan_key: v.planKey, limits: v.limits, trial_ends_at: trialEnds, status: "active", suspended_by: null }).eq("id", tid);
    await log(v.subscriptionId, tid, true, "revived");
    return reply(200, { ok: true, product_tenant_id: tid, login_url: APP_URL, state: "active", revived: true });
  }

  let tenantId: string | null = null;
  for (let i = 0; i < 4 && !tenantId; i++) {
    const { data, error } = await db.from("tenants").insert({
      slug: newSlug(v.business), name: v.business, plan_key: v.planKey, limits: v.limits,
      billing_source: "kaizen", kaizen_subscription_id: v.subscriptionId, trial_ends_at: trialEnds,
    }).select("id").single();
    if (data) tenantId = data.id;
    else if (error && !/slug/i.test(error.message)) throw new Error(error.message);
  }
  if (!tenantId) throw new Error("could not find a free slug");
  await db.from("tenant_profile").insert({ tenant_id: tenantId, display_name: v.name });
  await db.from("tenant_members").insert({ tenant_id: tenantId, user_id: userId, role: "owner" });
  await db.rpc("seed_tenant", { t: tenantId });
  await log(v.subscriptionId, tenantId, true, null);
  return reply(200, { ok: true, product_tenant_id: tenantId, login_url: APP_URL, state: "active" });
}

async function change(db: Db, action: "suspend" | "resume" | "cancel", body: Record<string, unknown>, log: Log): Promise<Response> {
  const p = parseChange(body);
  if (!p.ok) { await log(null, null, false, "bad_request"); return reply(400, { ok: false, code: "bad_request", error: p.error }); }
  const { data: t } = await db.from("tenants").select("id, status, suspended_by").eq("kaizen_subscription_id", p.subscriptionId).maybeSingle();
  if (!t) { await log(p.subscriptionId, null, false, "unknown_subscription"); return reply(404, { ok: false, code: "unknown_subscription", error: "Unknown subscription." }); }

  let state: string = t.status === "ended" ? "cancelled" : t.status === "suspended" ? "suspended" : "active";
  if (action === "suspend" && t.status === "active") {
    await db.from("tenants").update({ status: "suspended", suspended_by: "billing" }).eq("id", t.id);
    state = "suspended";
  } else if (action === "resume" && t.status === "suspended" && t.suspended_by === "billing") {
    // Only what billing paused comes back; a workspace Nevorai paused by hand stays paused.
    await db.from("tenants").update({ status: "active", suspended_by: null }).eq("id", t.id);
    state = "active";
  } else if (action === "cancel" && t.status !== "ended") {
    await db.from("tenants").update({ status: "ended", suspended_by: null }).eq("id", t.id);
    state = "cancelled";
  }
  await log(p.subscriptionId, t.id, true, null);
  return reply(200, { ok: true, product_tenant_id: t.id, state });
}
