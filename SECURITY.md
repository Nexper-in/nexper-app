# Nexper app: security review

Reviewed 2026-10-01 (code, dependencies, database scripts, headers, API routes).
Nothing here contains secrets.

## Fixed in this pass

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **Critical** (if 007 was run as is) | `admin_transfer_shop_ownership` had no permission check and its default EXECUTE grant was never revoked, so anyone with the public anon key could call it and take over any shop | `028_lock_down_function_access.sql` revokes it from everyone but the server; every other definer function is now signed-in only |
| 2 | **High** | Next.js 14.2 had 2 critical and several high advisories (remote code execution, denial of service, SSRF, cache poisoning) | Upgraded to Next 15.5.27 and React 19; `npm audit` reports 0 vulnerabilities |
| 3 | Medium | Stored XSS: an item name like `</title><script>…` ran in the barcode print window | Name is HTML-escaped |
| 4 | Medium | UPI IDs, amounts and the group link were sent to a third-party QR image service | QR codes are drawn in the browser (`components/QrImage.js`); nothing leaves the device |
| 5 | Medium | No security headers | CSP, HSTS, no framing, nosniff, referrer and permissions policy on the app and the website |
| 6 | Medium | Shop data kept in the service worker cache and local copies after sign out on a shared phone | Supabase and `/api` are network-only; sign out clears offline copies and cache storage (unsynced offline bills are kept) |
| 7 | Medium | Scan APIs open to anyone (could spend the Anthropic budget) | Sign-in, per-user rate limit, size and type checks |
| 8 | Low | Staff/admin routes crashed on bad JSON and returned raw database errors | Safe JSON parsing, generic 500s |
| 9 | Low | Staff PINs like 123456 or 111111 were accepted | Rejected |
| 10 | Low | Rate limit trusted a client-supplied forwarding header | Prefers Vercel's own client-IP header |
| 11 | Low | Sign-in page printed any text from the address bar (fake "call this number" links) | Fixed wording only |
| 12 | Low | External links opened without `noopener` | Added |
| 13 | Low | Image optimiser allowed any host | Removed (not used) |

## Platform console, API and MCP (added later)

- Every `/api/admin/*` route needs a signed-in platform admin (`requireAdmin`), is rate limited where it sends mail or makes keys, validates input, and is audit logged.
- API keys (`nxp_...`) are shown once and stored as a SHA-256 hash; revoke is immediate; scopes are read-only; each key is rate limited; wrong keys get the same answer as missing ones. Off until enabled globally and per shop.
- MCP masks customer phone numbers and has no write tools.
- `shops.plan` can no longer be changed by owners once "Let owners switch plan themselves" is turned off (trigger `protect_shop_plan`). Sign-up can be closed or invite-only in the database (`can_create_shop`), not only in the screen.

## Supplies (030)

- Three new tables, all `shop_id` + row-level security needing the `Supplies` permission; `npm run test:db` proves in a real Postgres that another shop (or billing-only staff) cannot read or write them, that prices cannot be set from the browser, and that anonymous callers cannot call the new functions. Runs on every push.

## Fingerprint / Face ID sign-in and app lock (032)

- The device proves it holds a private key by signing a one-time challenge; the server checks the signature, the site address (so a look-alike site gets nothing), that the fingerprint/face check happened, and the replay counter, and only then asks Supabase for a one-time sign-in token. Challenges are single-use and expire in five minutes. Tested with real WebAuthn answers, including a wrong key, a phishing address, a replayed answer, a cloned device, a suspended account, and a challenge reused from registration (`tests/passkeys.test.mjs`), and in a real browser engine with a virtual fingerprint reader.
- Only the public key is stored. The tables have no browser access at all (service role only).
- Suspended accounts cannot get back in through a passkey. Platform admins can switch the feature off.
- The app lock is a screen lock on the device (works offline); it does not protect the account on another device.
- Rate limited per address (in memory, like the other limits).

## Multi-tenant isolation and scale (031)

- `tests/db/isolation.rls.mjs` checks every table (31): another shop, an anonymous visitor and a helper without the permission can read, change, delete or insert nothing of shop A's. A new table fails the build until it is added.
- The API silently stops at 1000 rows. Screens that loaded everything were quietly wrong past that (Day close totals, bill numbers, balances, item lists, admin totals). Fixed with date windows, paging and database totals; `docs/ARCHITECTURE.md` has the rule and the measurements.
- The owner export is built in the browser from the owner's own session; spreadsheet formula injection is neutralised.
- `npm run check:audit` replaces the plain audit gate: a new high advisory in `braces` (build tooling, no fix published) is listed in `tools/audit-allow.json` with a reason and a review date (2026-12-01).

## Still open (not code)

- Run migrations 024-032 in Supabase. After 028, check:
  `select has_function_privilege('anon','admin_transfer_shop_ownership(uuid,uuid)','execute');` returns false.
- The rate limiter is in memory (resets on cold starts). Add a shared one (Upstash/Vercel KV) before heavy public use.
- Supabase Auth settings to check by hand: email confirmation on, minimum password length 8+, leaked-password protection, redirect URLs limited to the real domains.
- Before taking payments, turn off "Let owners switch plan themselves" in the console (Pricing & tax) so only you can change a plan.
- Staff can read the staff codes of other staff in the same shop (a code alone is not enough to sign in, the PIN is also needed).
- Never put `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` in a `NEXT_PUBLIC_*` variable.

## How to re-check

`npm test`, `node tools/check-i18n.mjs`, `npm audit --omit=dev`, `npx next build`. GitHub runs all four on every push.
