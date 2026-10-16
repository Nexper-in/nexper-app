// Run: npm test. Sign-in with fingerprint / Face ID / passkey: the server's
// checks, run against real WebAuthn answers from a software authenticator.
import test from "node:test";
import assert from "node:assert/strict";
import { SoftAuthenticator, otherKey } from "./helpers/softAuthenticator.mjs";

const P = await import("../lib/passkeys.js");

const RP = { rpID: "app.nexper.in", origin: "https://app.nexper.in", rpName: "Nexper" };
const USER = { id: "11111111-1111-4111-8111-111111111111", email: "suresh@example.com", user_metadata: { full_name: "Suresh" } };

// ---------- a small in-memory database and auth service ----------
function fakeAdmin({ users = {}, failLink = false } = {}) {
  const tables = { passkeys: [], passkey_challenges: [] };
  let n = 0;
  const calls = { generateLink: 0 };
  function from(name) {
    let rows = tables[name];
    let op = "select";
    let payload = null;
    const filters = [];
    const match = (r) => filters.every((f) => f(r));
    const b = {
      select: () => b,
      insert: (row) => ((op = "insert"), (payload = row), b),
      update: (v) => ((op = "update"), (payload = v), b),
      delete: () => ((op = "delete"), b),
      eq: (c, v) => (filters.push((r) => r[c] === v), b),
      lt: (c, v) => (filters.push((r) => r[c] < v), b),
      order: () => b,
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res, rej) => Promise.resolve(run(false)).then(res, rej),
    };
    function run(single) {
      if (op === "insert") {
        if (name === "passkeys" && tables.passkeys.some((p) => p.credential_id === payload.credential_id)) return { data: null, error: { code: "23505", message: "duplicate" } };
        const row = { id: `id${++n}`, created_at: new Date().toISOString(), last_used_at: null, ...payload };
        tables[name].push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        rows.filter(match).forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      if (op === "delete") {
        const gone = rows.filter(match);
        tables[name] = rows = rows.filter((r) => !match(r));
        return single ? { data: gone[0] || null, error: null } : { data: gone, error: null };
      }
      const out = rows.filter(match);
      return single ? { data: out[0] || null, error: null } : { data: out, error: null };
    }
    return b;
  }
  return {
    tables,
    calls,
    from,
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: users[id] || null }, error: null }),
        generateLink: async ({ email }) => {
          calls.generateLink++;
          return failLink ? { data: null, error: { message: "boom" } } : { data: { properties: { hashed_token: "HASH-" + email } }, error: null };
        },
      },
    },
  };
}

const authUsers = { [USER.id]: { id: USER.id, email: USER.email } };

async function addDevice(admin, { counter = 0, uv = true } = {}) {
  const device = new SoftAuthenticator({ ...RP, userVerified: uv, counter });
  const { options, challengeId } = await P.registrationOptions({ admin, user: USER, rp: RP });
  const saved = await P.registrationVerify({ admin, user: USER, rp: RP, challengeId, response: device.create(options), name: "  My <b>phone</b>  " });
  return { device, saved };
}

// ---------- which sites may use passkeys ----------
test("host: our domains and localhost only, and a configured app address wins", () => {
  const h = (host, extra = {}) => ({ get: (k) => ({ host, ...extra })[k.toLowerCase()] ?? null });
  assert.deepEqual(P.resolveRp(h("app.nexper.in"), undefined), { rpID: "app.nexper.in", origin: "https://app.nexper.in", rpName: "Nexper" });
  assert.equal(P.resolveRp(h("nexper.in"), undefined).rpID, "nexper.in");
  assert.equal(P.resolveRp(h("evil.com"), undefined), null);
  assert.equal(P.resolveRp(h("nexper.in.evil.com"), undefined), null);
  assert.equal(P.resolveRp(h("notnexper.in"), undefined), null);
  assert.equal(P.resolveRp(h("localhost:3000"), undefined).origin, "http://localhost:3000");
  assert.equal(P.resolveRp(h("app.nexper.in"), "https://other.example.com"), null);
  assert.equal(P.resolveRp(h("other.example.com"), "https://other.example.com").rpID, "other.example.com");
  assert.equal(P.resolveRp(h(""), undefined), null);
  assert.equal(P.resolveRp(h("x", { "x-forwarded-host": "app.nexper.in" }), undefined).rpID, "app.nexper.in");
});

// ---------- adding a device ----------
test("add device: the options ask for a key kept on the device and unlocked by fingerprint/face", async () => {
  const admin = fakeAdmin();
  const { options, challengeId } = await P.registrationOptions({ admin, user: USER, rp: RP });
  assert.equal(options.rp.id, "app.nexper.in");
  assert.equal(options.authenticatorSelection.residentKey, "required");
  assert.equal(options.authenticatorSelection.userVerification, "required");
  assert.equal(options.attestation, "none");
  assert.ok(challengeId && admin.tables.passkey_challenges.length === 1);
});

test("add device: a good device is stored (public key only), the name is cleaned", async () => {
  const admin = fakeAdmin();
  const { device, saved } = await addDevice(admin);
  assert.equal(saved.name, "My bphone/b");
  const row = admin.tables.passkeys[0];
  assert.equal(row.credential_id, device.id);
  assert.equal(row.user_id, USER.id);
  assert.ok(row.public_key && !JSON.stringify(row).includes("PRIVATE"));
  assert.equal(admin.tables.passkey_challenges.length, 0, "the challenge was used up");
});

test("add device: refused when the challenge is reused, expired, someone else's, or the site is wrong", async () => {
  const admin = fakeAdmin();
  const dev = new SoftAuthenticator(RP);
  const { options, challengeId } = await P.registrationOptions({ admin, user: USER, rp: RP });
  const answer = dev.create(options);
  await P.registrationVerify({ admin, user: USER, rp: RP, challengeId, response: answer });
  await assert.rejects(() => P.registrationVerify({ admin, user: USER, rp: RP, challengeId, response: answer }), /took too long/, "reused");

  const o2 = await P.registrationOptions({ admin, user: USER, rp: RP });
  admin.tables.passkey_challenges.find((c) => c.id === o2.challengeId).expires_at = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(() => P.registrationVerify({ admin, user: USER, rp: RP, challengeId: o2.challengeId, response: new SoftAuthenticator(RP).create(o2.options) }), /took too long/, "expired");

  const o3 = await P.registrationOptions({ admin, user: USER, rp: RP });
  await assert.rejects(
    () => P.registrationVerify({ admin, user: { ...USER, id: "22222222-2222-4222-8222-222222222222" }, rp: RP, challengeId: o3.challengeId, response: new SoftAuthenticator(RP).create(o3.options) }),
    /took too long/,
    "another user's challenge"
  );

  const o4 = await P.registrationOptions({ admin, user: USER, rp: RP });
  await assert.rejects(() => P.registrationVerify({ admin, user: USER, rp: RP, challengeId: o4.challengeId, response: new SoftAuthenticator(RP).create(o4.options, { origin: "https://evil.com" }) }), /couldn't verify/, "wrong site");

  const o5 = await P.registrationOptions({ admin, user: USER, rp: RP });
  await assert.rejects(() => P.registrationVerify({ admin, user: USER, rp: RP, challengeId: o5.challengeId, response: new SoftAuthenticator(RP).create(o5.options, { challenge: "dGFtcGVyZWQ" }) }), /couldn't verify/, "wrong challenge");

  const o6 = await P.registrationOptions({ admin, user: USER, rp: RP });
  await assert.rejects(() => P.registrationVerify({ admin, user: USER, rp: RP, challengeId: o6.challengeId, response: new SoftAuthenticator({ ...RP, userVerified: false }).create(o6.options) }), /couldn't verify/, "no fingerprint/face check");
  assert.equal(admin.tables.passkeys.length, 1);
});

test("add device: the same device twice is refused; at most 10 devices", async () => {
  const admin = fakeAdmin();
  const dev = new SoftAuthenticator(RP);
  const a = await P.registrationOptions({ admin, user: USER, rp: RP });
  await P.registrationVerify({ admin, user: USER, rp: RP, challengeId: a.challengeId, response: dev.create(a.options) });
  const b = await P.registrationOptions({ admin, user: USER, rp: RP });
  assert.ok(b.options.excludeCredentials.some((c) => c.id === dev.id), "the browser is told to skip devices already added");
  await assert.rejects(() => P.registrationVerify({ admin, user: USER, rp: RP, challengeId: b.challengeId, response: dev.create(b.options) }), (e) => e.status === 409);
  for (let i = 0; i < 9; i++) admin.tables.passkeys.push({ id: "x" + i, user_id: USER.id, credential_id: "c" + i });
  await assert.rejects(() => P.registrationOptions({ admin, user: USER, rp: RP }), /most devices/);
});

// ---------- signing in ----------
async function signIn(admin, device, opts = {}, verifyOpts = {}) {
  const { options, challengeId } = await P.loginOptions({ admin, rp: RP });
  return P.loginVerify({ admin, rp: RP, challengeId, response: device.get(options, opts), ...verifyOpts });
}

test("sign in: asks for fingerprint/face, accepts a good answer and hands out a one-time token", async () => {
  const admin = fakeAdmin({ users: authUsers });
  const { device } = await addDevice(admin);
  const { options } = await P.loginOptions({ admin, rp: RP });
  assert.equal(options.userVerification, "required");
  assert.deepEqual(options.allowCredentials || [], [], "usernameless: the device chooses the account");
  const out = await signIn(admin, device);
  assert.equal(out.userId, USER.id);
  assert.equal(out.tokenHash, "HASH-suresh@example.com");
  assert.ok(admin.tables.passkeys[0].last_used_at);
  assert.equal(admin.calls.generateLink, 1);
});

test("sign in: every kind of bad answer is refused and no token is made", async () => {
  const admin = fakeAdmin({ users: authUsers });
  const { device } = await addDevice(admin);
  const refused = async (label, opts, verifyOpts, re = /couldn't sign you in|took too long/) =>
    assert.rejects(() => signIn(admin, device, opts, verifyOpts), re, label);

  await refused("signed with someone else's key", { signWith: otherKey() });
  await refused("a phishing site's address", { origin: "https://app.nexper.in.evil.com" });
  await refused("another site's key scope", { rpID: "evil.com" });
  await refused("a different challenge", { challenge: "dGFtcGVyZWQ" });

  // replaying a captured answer
  const { options, challengeId } = await P.loginOptions({ admin, rp: RP });
  const answer = device.get(options);
  await P.loginVerify({ admin, rp: RP, challengeId, response: answer });
  await assert.rejects(() => P.loginVerify({ admin, rp: RP, challengeId, response: answer }), /took too long/, "replay");

  // unknown device, and a device claiming to be a different account
  const stranger = new SoftAuthenticator(RP);
  await assert.rejects(() => signIn(admin, stranger), /couldn't sign you in/, "unknown device");
  device.userHandle = Buffer.from("99999999-9999-4999-8999-999999999999");
  await refused("device claims another account", {});
  assert.equal(admin.calls.generateLink, 1, "a token was handed out only for the one good sign-in");
});

test("sign in: an old answer with a lower counter is refused (cloned device)", async () => {
  const admin = fakeAdmin({ users: authUsers });
  const { device } = await addDevice(admin);
  device.counter = 5;
  await signIn(admin, device, { bumpCounter: false });
  assert.equal(Number(admin.tables.passkeys[0].counter), 5);
  device.counter = 3;
  await assert.rejects(() => signIn(admin, device, { bumpCounter: false }), /couldn't sign you in/);
});

test("sign in: devices that always report counter 0 (synced passkeys) still work", async () => {
  const admin = fakeAdmin({ users: authUsers });
  const { device } = await addDevice(admin);
  await signIn(admin, device, { bumpCounter: false });
  await signIn(admin, device, { bumpCounter: false });
  assert.equal(admin.calls.generateLink, 2);
});

test("sign in: a switched-off account cannot get in, and a missing account is refused", async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const banned = fakeAdmin({ users: { [USER.id]: { id: USER.id, email: USER.email, banned_until: future } } });
  const { device } = await addDevice(banned);
  await assert.rejects(() => signIn(banned, device), (e) => e.status === 403);
  assert.equal(banned.calls.generateLink, 0);
  const gone = fakeAdmin({ users: {} });
  const d2 = (await addDevice(gone)).device;
  await assert.rejects(() => signIn(gone, d2), /couldn't sign you in/);
});

test("sign in: the stored challenge cannot be a registration one", async () => {
  const admin = fakeAdmin({ users: authUsers });
  const { device } = await addDevice(admin);
  const reg = await P.registrationOptions({ admin, user: USER, rp: RP });
  await assert.rejects(() => P.loginVerify({ admin, rp: RP, challengeId: reg.challengeId, response: device.get(reg.options) }), /took too long/);
});
