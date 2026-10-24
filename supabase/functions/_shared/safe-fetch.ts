// Tenants type the feed addresses that the server later fetches, so the server must never be
// tricked into reading internal addresses (SSRF). https only, no IP literals, no internal names,
// the name must not resolve to a private address, redirects are followed by hand and re-checked,
// and the answer is capped in time and size.

const BLOCKED_NAME = /(^|\.)(localhost|local|internal|lan|home|corp)$/i;

function privateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  return (
    p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Not a valid web address."); }
  if (u.protocol !== "https:") throw new Error("Only https:// addresses are allowed.");
  if (u.username || u.password) throw new Error("Addresses with a login inside are not allowed.");
  if (u.port && u.port !== "443") throw new Error("Only the standard port is allowed.");
  const host = u.hostname;
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) throw new Error("Use a web name, not a number address.");
  if (BLOCKED_NAME.test(host) || !host.includes(".")) throw new Error("That address is not public.");
  for (const type of ["A", "AAAA"] as const) {
    try {
      const ips = await Deno.resolveDns(host, type);
      if (ips.some(privateIp)) throw new Error("That address is not public.");
    } catch (e) {
      if ((e as Error).message === "That address is not public.") throw e;
    }
  }
  return u;
}

/** GET a public address as text: max 3 hops, 10 s, 2 MB. */
export async function safeFetchText(raw: string, headers: Record<string, string> = {}): Promise<string> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(url);
    const res = await fetch(u, { headers, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Bad redirect.");
      url = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) return "";
    const parts: string[] = [];
    const dec = new TextDecoder();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 2_000_000) { await reader.cancel(); break; }
      parts.push(dec.decode(value, { stream: true }));
    }
    return parts.join("");
  }
  throw new Error("Too many redirects.");
}
