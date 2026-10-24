// Nevorai Creator is multi-tenant: every function call belongs to ONE tenant (a creator).
// The browser sends the signed-in user's JWT and an x-tenant-id header. The header only
// counts if that user is a member of that tenant (checked here, with the service role,
// because service-role queries skip RLS). A user with exactly one tenant needs no header.
//
//   const g = await guard(req, "write");     // "read" | "write" | "owner"
//   if (g instanceof Response) return g;
//   const { tenantId, db } = g;               // db = service-role client, schema creator_os
//
// Rule for every query through g.db: ALWAYS filter by tenantId (it bypasses RLS).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "./cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Role = "owner" | "editor" | "viewer";
export type Need = "read" | "write" | "owner";
// deno-lint-ignore no-explicit-any
export type Db = ReturnType<typeof createClient<any, "creator_os", any>>;
export type Guard = { tenantId: string; userId: string; role: Role; db: Db };

export function serviceClient(): Db {
  return createClient<any, "creator_os", any>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    db: { schema: "creator_os" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Who is calling, which tenant they mean, and may they do this? Returns the answer or the Response to send back. */
export async function guard(req: Request, need: Need): Promise<Guard | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error } = await asCaller.auth.getUser();
  if (error || !userData?.user) return json(req, { error: "Not signed in." }, 401);
  const userId = userData.user.id;

  const db = serviceClient();
  const { data: memberships } = await db
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId);
  const mine = memberships ?? [];

  const asked = req.headers.get("x-tenant-id") ?? "";
  let pick: { tenant_id: string; role: Role } | undefined;
  if (asked) {
    if (!UUID.test(asked)) return json(req, { error: "Bad tenant." }, 400);
    pick = mine.find((m) => m.tenant_id === asked.toLowerCase()) as typeof pick;
  } else if (mine.length === 1) {
    pick = mine[0] as typeof pick;
  }
  // 403, not 404: same answer whether the tenant exists or not, so ids can't be probed.
  if (!pick) return json(req, { error: "This account has no access to that workspace." }, 403);

  if (need === "owner" && pick.role !== "owner") return json(req, { error: "Only the owner can do this." }, 403);
  if (need === "write") {
    if (pick.role === "viewer") return json(req, { error: "Your role is view-only." }, 403);
  }
  if (need !== "read") {
    const { data: t } = await db.from("tenants").select("status").eq("id", pick.tenant_id).single();
    if (t?.status !== "active") {
      return json(req, { error: "This workspace is paused. Open Billing to continue." }, 402);
    }
  }
  return { tenantId: pick.tenant_id, userId, role: pick.role, db };
}

/** The AI key to use for this tenant: its own if it saved one, else Nevorai's (which spends the tenant's monthly AI credits). */
export async function aiKey(
  db: Db,
  tenantId: string,
  which: "anthropic" | "gemini" = "anthropic",
): Promise<{ key: string; platform: boolean } | null> {
  const col = which === "anthropic" ? "anthropic_api_key" : "gemini_api_key";
  const { data: own } = await db.from("tenant_secrets").select(col).eq("tenant_id", tenantId).maybeSingle();
  const ownKey = (own as Record<string, string | null> | null)?.[col];
  if (ownKey) return { key: ownKey, platform: false };
  const { data: plat } = await db.from("platform_settings").select(col).eq("id", 1).maybeSingle();
  const platKey = (plat as Record<string, string | null> | null)?.[col] || Deno.env.get(which === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY");
  return platKey ? { key: platKey, platform: true } : null;
}

/** Spend AI credits when Nevorai's key pays. Returns the 429 to send back when the month's cap is reached, else null. */
export async function spend(req: Request, g: Guard, k: { platform: boolean }, n = 1): Promise<Response | null> {
  if (!k.platform) return null;
  const { data, error } = await g.db.rpc("use_ai_credit", { t: g.tenantId, n });
  if (error) return json(req, { error: "Could not check your AI credits. Try again." }, 500);
  if (data !== true) {
    return json(req, { error: "You have used this month's AI credits. They reset on the 1st, or ask for a bigger plan." }, 429);
  }
  return null;
}
