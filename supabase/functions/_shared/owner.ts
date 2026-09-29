// Creator OS is one person's tool, but it lives in the shared Nevorai OS project where people from other apps
// (Academy OS students and coaches, AdsPro and Meta review accounts) also have logins. "Signed in" is therefore
// not enough: every function checks the caller is an owner (creator_os.owners, via creator_os.is_owner(),
// migration 0012). Scheduled jobs call with the service_role key and are let through by scheduleOrOwner().
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "./cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Call after the function's own getUser() check. Returns the 403 to send back for non-owners, else null. */
export async function ownerOnly(req: Request): Promise<Response | null> {
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    db: { schema: "creator_os" },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data, error } = await asCaller.rpc("is_owner");
  if (error || data !== true) {
    return json(req, { error: "This account cannot use Creator OS." }, 403);
  }
  return null;
}

/** For scheduled functions: the pg_cron job (service_role key) or a signed-in owner may call; nobody else. */
export async function scheduleOrOwner(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  // The empty-key guard matters: without it a missing env var would let "Bearer undefined" through.
  if (SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY) return null;

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await asCaller.auth.getUser();
  if (!error && data?.user) return ownerOnly(req);

  // Not a user and not that exact key: still accept any admin-level key for this project (say the cron job
  // holds a new-style secret key). Only such a key can list users, and it can already read everything anyway.
  if (token && (await isAdminKey(token))) return null;
  return json(req, { error: "Not signed in." }, 401);
}

async function isAdminKey(token: string): Promise<boolean> {
  const admin = createClient(SUPABASE_URL, token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !error;
}
