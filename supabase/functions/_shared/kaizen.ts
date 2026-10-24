// The contract with Nevorai Kaizen (billing.nevorai.com). Kaizen charges and invoices; Creator only
// learns paid / suspended / cancelled and the plan's limits. Pure rules here (no I/O), so they can be
// tested with `deno test supabase/functions/_shared/kaizen.test.ts`. Same shape as Nevorai Connect's.
//   POST .../kaizen/provision  { kaizen_subscription_id, customer{name,business,phone,email}, plan_key, limits, product_tenant_id?, trial?, trial_ends_at?, sent_at }
//   POST .../kaizen/suspend | resume | cancel  { kaizen_subscription_id, sent_at }
// Header X-Kaizen-Signature = hex HMAC-SHA256 of the raw body with KAIZEN_PROVISION_SECRET.

export const SIGNATURE_HEADER = "x-kaizen-signature";
export const MAX_BODY = 16 * 1024;
export const SKEW_MS = 10 * 60_000;

const enc = new TextEncoder();
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function signBody(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
}

function equalConstTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** True only for the exact signature of this body made with this secret. A missing or short secret refuses everything. */
export async function verifySignature(raw: string, header: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < 16 || !header) return false;
  const given = header.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  return equalConstTime(given, await signBody(raw, secret));
}

/** `sent_at` is optional; when present it must be recent, so an old "suspend" can't be replayed after a "resume". */
export function freshEnough(sentAt: unknown, now = Date.now()): boolean {
  if (sentAt === undefined || sentAt === null) return true;
  let t = NaN;
  if (typeof sentAt === "number") t = sentAt < 1e11 ? sentAt * 1000 : sentAt;
  else if (typeof sentAt === "string") t = Date.parse(sentAt);
  return Number.isFinite(t) && Math.abs(now - t) <= SKEW_MS;
}

// What a plan can say. Counts are whole numbers; features are on/off. Anything else is dropped.
export const LIMIT_KEYS = { watchlist: [0, 500], sources: [0, 200], seats: [1, 50], ai_credits: [0, 1_000_000] } as const;
export const FEATURE_KEYS = ["research", "landing", "payments", "whatsapp", "email"] as const;

export type Limits = Record<string, number | boolean>;

/** Keeps only known keys, clamps numbers, so a bad or hostile plan can never write junk into the tenant row. */
export function cleanLimits(raw: unknown): Limits {
  const out: Limits = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const [k, [lo, hi]] of Object.entries(LIMIT_KEYS)) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, Math.trunc(v)));
  }
  for (const k of FEATURE_KEYS) if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  return out;
}

const SUB_ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const PLAN_KEY = /^[a-z][a-z0-9_-]{1,30}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export type Provision = {
  subscriptionId: string; name: string; business: string; email: string; phone: string | null;
  planKey: string; limits: Limits; productTenantId: string | null; trial: boolean | null; trialEndsAt: string | null;
};

export function parseProvision(body: unknown): { ok: true; v: Provision } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Send JSON." };
  const b = body as Record<string, unknown>;
  const subscriptionId = typeof b.kaizen_subscription_id === "string" ? b.kaizen_subscription_id.trim() : "";
  if (!SUB_ID.test(subscriptionId)) return { ok: false, error: "kaizen_subscription_id is missing or invalid." };
  const c = b.customer && typeof b.customer === "object" && !Array.isArray(b.customer) ? (b.customer as Record<string, unknown>) : null;
  if (!c) return { ok: false, error: "customer is missing." };
  const email = text(c.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "customer.email is missing or invalid." };
  const name = text(c.name, 120);
  const business = text(c.business, 120) || name;
  if (!business) return { ok: false, error: "customer.business or customer.name is needed." };
  const phone = text(c.phone, 30).replace(/[^\d+]/g, "");
  const planKey = typeof b.plan_key === "string" ? b.plan_key.trim().toLowerCase() : "";
  if (!PLAN_KEY.test(planKey)) return { ok: false, error: "plan_key is missing or invalid." };
  const rawTenant = b.product_tenant_id;
  if (rawTenant !== undefined && rawTenant !== null && (typeof rawTenant !== "string" || !UUID.test(rawTenant.trim()))) {
    return { ok: false, error: "product_tenant_id is invalid." };
  }
  const trial = typeof b.trial === "boolean" ? b.trial : null;
  const endsMs = typeof b.trial_ends_at === "string" ? Date.parse(b.trial_ends_at) : NaN;
  return {
    ok: true,
    v: {
      subscriptionId, name: name || business, business, email, phone: phone || null, planKey,
      limits: cleanLimits(b.limits),
      productTenantId: typeof rawTenant === "string" ? rawTenant.trim().toLowerCase() : null,
      trial,
      trialEndsAt: trial === true && Number.isFinite(endsMs) ? new Date(endsMs).toISOString() : null,
    },
  };
}

export function parseChange(body: unknown): { ok: true; subscriptionId: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Send JSON." };
  const id = (body as Record<string, unknown>).kaizen_subscription_id;
  const subscriptionId = typeof id === "string" ? id.trim() : "";
  if (!SUB_ID.test(subscriptionId)) return { ok: false, error: "kaizen_subscription_id is missing or invalid." };
  return { ok: true, subscriptionId };
}

/** "Ravi Fitness & Co." -> "ravi-fitness-co" (2 to 30 letters, digits, dashes). */
export function slugBase(name: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "");
  return s.length >= 2 ? s : "creator";
}
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export function newSlug(name: string): string {
  const r = crypto.getRandomValues(new Uint8Array(4));
  return `${slugBase(name)}-${[...r].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

// ── The one-time pass that opens billing.nevorai.com already signed in ──
const b64url = (bytes: Uint8Array | string) => {
  const u = typeof bytes === "string" ? enc.encode(bytes) : bytes;
  return btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const PASS_SECONDS = 60;

export async function makePass(
  o: { email: string; tenantId: string; business: string; plan?: string },
  secret: string,
  now = Date.now(),
): Promise<string> {
  const claims = {
    v: 1, p: "creator", email: o.email.toLowerCase(), ref: o.tenantId, name: o.business.slice(0, 120),
    ...(o.plan ? { plan: o.plan } : {}),
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + PASS_SECONDS,
    jti: toHex(crypto.getRandomValues(new Uint8Array(16)).buffer),
  };
  const body = b64url(JSON.stringify(claims));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))));
  return `${body}.${sig}`;
}
