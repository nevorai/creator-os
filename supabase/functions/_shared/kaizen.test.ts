import { assert, assertEquals } from "jsr:@std/assert@1";
import { cleanLimits, freshEnough, makePass, newSlug, parseChange, parseProvision, signBody, slugBase, verifySignature } from "./kaizen.ts";

const SECRET = "x".repeat(40);

Deno.test("signature: right body passes, tampered/short/missing fail", async () => {
  const raw = '{"kaizen_subscription_id":"s1"}';
  const sig = await signBody(raw, SECRET);
  assert(await verifySignature(raw, sig, SECRET));
  assert(await verifySignature(raw, "sha256=" + sig.toUpperCase(), SECRET));
  assert(!(await verifySignature(raw + " ", sig, SECRET)));
  assert(!(await verifySignature(raw, sig, "short")));
  assert(!(await verifySignature(raw, sig, undefined)));
  assert(!(await verifySignature(raw, null, SECRET)));
  assert(!(await verifySignature(raw, "zz", SECRET)));
});

Deno.test("freshness: replays older than 10 minutes are refused", () => {
  const now = Date.now();
  assert(freshEnough(undefined));
  assert(freshEnough(new Date(now - 60_000).toISOString(), now));
  assert(!freshEnough(new Date(now - 11 * 60_000).toISOString(), now));
  assert(!freshEnough(new Date(now + 11 * 60_000).toISOString(), now));
  assert(!freshEnough("garbage", now));
});

Deno.test("limits: unknown keys dropped, numbers clamped", () => {
  assertEquals(cleanLimits({ watchlist: 9999, seats: 0, ai_credits: 500.9, evil: 1, research: true, landing: "yes" }), {
    watchlist: 500, seats: 1, ai_credits: 500, research: true,
  });
  assertEquals(cleanLimits(null), {});
  assertEquals(cleanLimits([1]), {});
});

Deno.test("provision parsing", () => {
  const good = parseProvision({
    kaizen_subscription_id: "sub_1", customer: { name: " Ravi  K ", business: "Ravi Health", phone: "+91 98765-43210", email: "RAVI@Example.com" },
    plan_key: "Research", limits: { watchlist: 20 }, trial: true, trial_ends_at: "2026-11-01T00:00:00Z",
  });
  assert(good.ok);
  if (good.ok) {
    assertEquals(good.v.email, "ravi@example.com");
    assertEquals(good.v.phone, "+919876543210");
    assertEquals(good.v.planKey, "research");
    assertEquals(good.v.trialEndsAt, "2026-11-01T00:00:00.000Z");
  }
  assert(!parseProvision({}).ok);
  assert(!parseProvision({ kaizen_subscription_id: "bad id!", customer: {}, plan_key: "a" }).ok);
  assert(!parseProvision({ kaizen_subscription_id: "s", customer: { email: "nope", name: "x" }, plan_key: "pro" }).ok);
  assert(!parseProvision({ kaizen_subscription_id: "s", customer: { email: "a@b.co", name: "x" }, plan_key: "PRO PLAN" }).ok);
  assert(!parseProvision({ kaizen_subscription_id: "s", customer: { email: "a@b.co", name: "x" }, plan_key: "pro", product_tenant_id: "x" }).ok);
  assert(parseChange({ kaizen_subscription_id: "s1" }).ok);
  assert(!parseChange({ kaizen_subscription_id: "../x" }).ok);
});

Deno.test("slugs fit the database rule", () => {
  assertEquals(slugBase("Ravi Fitness & Co."), "ravi-fitness-co");
  assertEquals(slugBase("!!"), "creator");
  assert(/^[a-z0-9][a-z0-9-]{1,40}$/.test(newSlug("Sadhna Astro, the very long business name that goes on")));
});

Deno.test("billing pass has two parts and a 60 s life", async () => {
  const pass = await makePass({ email: "A@b.co", tenantId: "t", business: "B" }, SECRET, 1_000_000);
  const [body, sig, extra] = pass.split(".");
  assert(body && sig && extra === undefined);
  const claims = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  assertEquals(claims.p, "creator");
  assertEquals(claims.exp - claims.iat, 60);
  assertEquals(claims.email, "a@b.co");
});
