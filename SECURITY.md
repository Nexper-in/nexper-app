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

## Still open (not code)

- Run migration 028 (and 024-027) in Supabase. After 028, check:
  `select has_function_privilege('anon','admin_transfer_shop_ownership(uuid,uuid)','execute');` returns false.
- The rate limiter is in memory (resets on cold starts). Add a shared one (Upstash/Vercel KV) before heavy public use.
- Supabase Auth settings to check by hand: email confirmation on, minimum password length 8+, leaked-password protection, redirect URLs limited to the real domains.
- `shops.plan` can be changed by the shop owner under the current row-level rules. Fine while Pro is free; move it to a server-only change before taking payments.
- Staff can read the staff codes of other staff in the same shop (a code alone is not enough to sign in, the PIN is also needed).
- Never put `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` in a `NEXT_PUBLIC_*` variable.

## How to re-check

`npm test`, `node tools/check-i18n.mjs`, `npm audit --omit=dev`, `npx next build`. GitHub runs all four on every push.
