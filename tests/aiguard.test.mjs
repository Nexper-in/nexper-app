import test from "node:test";
import assert from "node:assert/strict";
import { installFakeSupabase } from "./helpers/fakeSupabase.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
const { guardImageRequest } = await import("../lib/aiGuard.js");

// The per-person speed limit (8 a minute) is in memory and shared by these tests, so each test is a different person.
let seq = 0;
function fakeFor(db) {
  const id = `person-${++seq}`;
  db.shop_members.forEach((m) => (m.user_id = id));
  return installFakeSupabase(db, { user: { id, email: id + "@x" } });
}
const MONTH = new Date().toISOString();
const scanReq = (body) => new Request("http://x/api/scan-supplier-bill", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ image: "abc", mediaType: "image/png", ...body }) });
const world = (over = {}) => ({
  platform_settings: [{ key: "gating", value: { enforce: true, allowSelfPlanSwitch: true } }],
  shops: [
    { id: "00000000-0000-4000-8000-000000000001", plan: "free", org_id: "orgA" },
    { id: "00000000-0000-4000-8000-000000000002", plan: "free", org_id: "orgA" },
    { id: "00000000-0000-4000-8000-000000000003", plan: "pro", org_id: "orgB" },
  ],
  shop_members: [
    { user_id: "u1", shop_id: "00000000-0000-4000-8000-000000000001" },
    { user_id: "u1", shop_id: "00000000-0000-4000-8000-000000000002" },
    { user_id: "u1", shop_id: "00000000-0000-4000-8000-000000000003" },
  ],
  tenant_controls: [],
  org_controls: [{ org_id: "orgA", plan: "pro", limits: { aiScansPerMonth: 3 } }],
  ai_usage: [],
  ...over,
});
const S1 = "00000000-0000-4000-8000-000000000001", S2 = "00000000-0000-4000-8000-000000000002", S3 = "00000000-0000-4000-8000-000000000003";
const use = (shop, org, n) => Array.from({ length: n }, (_, i) => ({ id: `${shop}-${i}`, shop_id: shop, org_id: org, created_at: MONTH }));

test("a chain's scans are pooled: shop 1 and 2 together are one allowance", async () => {
  const db = world({ ai_usage: [...use(S1, "orgA", 2), ...use(S2, "orgA", 1)] });
  const fake = fakeFor(db);
  try {
    const r = await guardImageRequest(scanReq({ shopId: S1 }));
    assert.equal(r.error.status, 429, "3 used across the company, limit 3");
  } finally {
    fake.restore();
  }
});

test("under the pooled limit the scan goes through and is charged to the shop it was made from", async () => {
  const db = world({ ai_usage: use(S1, "orgA", 2) });
  const fake = fakeFor(db);
  try {
    const r = await guardImageRequest(scanReq({ shopId: S2 }));
    assert.equal(r.error, undefined);
    const ins = fake.log.find((l) => l[0] === "insert" && l[1] === "ai_usage");
    assert.equal(ins[2][0].shop_id, S2, "charged to the shop the person scanned from");
  } finally {
    fake.restore();
  }
});

test("a person in two companies is charged to the company of the shop they scanned from", async () => {
  // company A is at its limit; company B (no limits set, plans enforced: free = 20) is not
  const db = world({ ai_usage: use(S1, "orgA", 3) });
  const fake = fakeFor(db);
  try {
    assert.equal((await guardImageRequest(scanReq({ shopId: S1 }))).error.status, 429);
    const b = await guardImageRequest(scanReq({ shopId: S3 }));
    assert.equal(b.error, undefined, "company B is unaffected by company A's usage");
    assert.equal(fake.log.find((l) => l[0] === "insert")[2][0].shop_id, S3);
  } finally {
    fake.restore();
  }
});

test("a shop's own limit counts that shop alone", async () => {
  const db = world({ tenant_controls: [{ shop_id: S2, limits: { aiScansPerMonth: 1 } }], ai_usage: [...use(S1, "orgA", 2), ...use(S2, "orgA", 1)] });
  const fake = fakeFor(db);
  try {
    assert.equal((await guardImageRequest(scanReq({ shopId: S2 }))).error.status, 429, "shop 2 used its own 1");
    assert.equal((await guardImageRequest(scanReq({ shopId: S1 }))).error.status, 429, "shop 1 still follows the pooled company limit (3 used)");
  } finally {
    fake.restore();
  }
});

test("a shop the person does not belong to is refused", async () => {
  const db = world({ shop_members: [{ user_id: "u1", shop_id: S1 }] });
  const fake = fakeFor(db);
  try {
    const r = await guardImageRequest(scanReq({ shopId: S3 }));
    assert.equal(r.error.status, 403);
  } finally {
    fake.restore();
  }
});

test("an older app that sends no shop is charged to the first shop, as before", async () => {
  const db = world({ org_controls: [], platform_settings: [], ai_usage: [] });
  const fake = fakeFor(db);
  try {
    const r = await guardImageRequest(scanReq({}));
    assert.equal(r.error, undefined);
    assert.equal(fake.log.find((l) => l[0] === "insert")[2][0].shop_id, S1);
  } finally {
    fake.restore();
  }
});

test("before database update 039 (no org tables) scans still work and count per shop", async () => {
  const db = world();
  delete db.org_controls;
  db.shops.forEach((x) => (x.plan = "pro"));
  db.ai_usage = use(S1, undefined, 3).map(({ org_id, ...r }) => r);
  const fake = fakeFor(db);
  try {
    // plans enforced, pro plan allows 500: 3 used by shop 1 is fine
    const r = await guardImageRequest(scanReq({ shopId: S1 }));
    assert.equal(r.error, undefined);
  } finally {
    fake.restore();
  }
});

// ---------- the read API: a company can switch it on for all its shops ----------
const { generateApiKey, hashApiKey } = await import("../lib/apiKeys.js");
const { authenticateKey } = await import("../lib/shopApi.js");
test("the read API: shop switch, company switch, and either level can forbid it", async () => {
  const k = generateApiKey();
  const token = k.key || k.token || k.plain || Object.values(k).find((v) => typeof v === "string" && v.startsWith("nxp_"));
  const base = () => ({
    platform_settings: [{ key: "integrations", value: { apiEnabled: true, mcpEnabled: false, rateLimitPerMin: 60 } }],
    api_keys: [{ id: "k1", shop_id: S1, scopes: ["read:shop"], key_hash: hashApiKey(token), revoked_at: null, last_used_at: null }],
    shops: [{ id: S1, plan: "free", org_id: "orgA" }],
    tenant_controls: [],
    org_controls: [],
  });
  const call = async (db) => {
    const fake = installFakeSupabase(db);
    try {
      return await authenticateKey(new Request("http://x/api/v1/shop", { headers: { authorization: "Bearer " + token } }), { feature: "api" });
    } finally {
      fake.restore();
    }
  };
  assert.equal((await call(base())).status, 403, "nothing switched on for the shop: refused");
  const shopOn = base();
  shopOn.tenant_controls = [{ shop_id: S1, api_enabled: true, feature_overrides: {} }];
  assert.ok((await call(shopOn)).ctx, "the shop's own switch turns it on");
  const coOn = base();
  coOn.org_controls = [{ org_id: "orgA", feature_overrides: { api_access: true } }];
  assert.ok((await call(coOn)).ctx, "a company can switch it on for all its shops");
  const coOff = base();
  coOff.tenant_controls = [{ shop_id: S1, api_enabled: true, feature_overrides: {} }];
  coOff.org_controls = [{ org_id: "orgA", feature_overrides: { api_access: false } }];
  assert.equal((await call(coOff)).status, 403, "a company can forbid it");
  const shopOff = base();
  shopOff.tenant_controls = [{ shop_id: S1, api_enabled: true, feature_overrides: { api_access: false } }];
  shopOff.org_controls = [{ org_id: "orgA", feature_overrides: { api_access: true } }];
  assert.equal((await call(shopOff)).status, 403, "and so can the shop's own override");
});
