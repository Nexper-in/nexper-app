// S19 and friends: rules about the source code itself, checked on every push.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "tests", "docs", "public", "i18n"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = ["app", "components", "lib", "tools", "scripts"].flatMap((d) => (fs.existsSync(ROOT + d) ? walk(ROOT + d) : []));
const read = (f) => fs.readFileSync(f, "utf8");
const rel = (f) => path.relative(ROOT, f);

test("the service-role client and key are never reachable from a browser component", () => {
  const bad = [];
  for (const f of files) {
    const src = read(f);
    const client = /^\s*["']use client["']/m.test(src.slice(0, 400));
    if (client && (/lib\/supabaseAdmin/.test(src) || /SUPABASE_SERVICE_ROLE_KEY/.test(src) || /createAdminClient/.test(src))) bad.push(rel(f));
  }
  assert.deepEqual(bad, []);
});

test("the service-role key is read in one place on the server (and in tools/scripts that run on a developer machine or in CI)", () => {
  const where = files.filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(read(f))).map(rel).sort();
  const allowed = new Set(["lib/supabaseAdmin.js", "scripts/seed-staging.mjs"]);
  assert.deepEqual(where.filter((w) => !allowed.has(w)), []);
});

test("no secret is exposed through a NEXT_PUBLIC_ name, and no Supabase address or key is written into the code", () => {
  const bad = [];
  for (const f of files) {
    const src = read(f);
    if (/NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET|ANTHROPIC|PRIVATE|PASSWORD|TOKEN)/.test(src)) bad.push(rel(f) + ": secret-looking NEXT_PUBLIC name");
    if (/https:\/\/[a-z0-9]{15,}\.supabase\.co/.test(src)) bad.push(rel(f) + ": a Supabase project address");
    if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(src)) bad.push(rel(f) + ": a JWT-looking key");
    if (/sk-ant-[A-Za-z0-9_-]{10,}/.test(src)) bad.push(rel(f) + ": an Anthropic key");
  }
  assert.deepEqual(bad, []);
});

test("code does not assume it runs at app.nexper.in: the address only appears in comments (use NEXT_PUBLIC_APP_URL)", () => {
  const bad = [];
  for (const f of files) {
    read(f).split("\n").forEach((line, i) => {
      if (/app\.nexper\.in/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line) && !/NEXT_PUBLIC_APP_URL/.test(line)) bad.push(`${rel(f)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("every server route that uses the service role starts with a sign-in or secret check (spot check of the patterns)", () => {
  const routes = files.filter((f) => /app\/api\/.*route\.js$/.test(f));
  const open = [];
  for (const f of routes) {
    const src = read(f);
    if (!/createAdminClient|requireAdmin|authenticateKey|passkeyContext|guardImageRequest/.test(src)) continue;
    const checked = /requireAdmin|getRequestUser|CRON_SECRET|authenticateKey|passkeyContext|guardImageRequest|HEALTH_TOKEN|isRateLimited|readJson/.test(src);
    if (!checked) open.push(rel(f));
  }
  assert.deepEqual(open, []);
});
