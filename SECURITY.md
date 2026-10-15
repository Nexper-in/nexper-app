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

## Returns, reminders and nightly summary (031)

- `sale_returns` and `reminder_log` carry `shop_id` and row-level security. Returns have no insert policy at all: they are written only by `process_return()`, which needs the billing permission, locks the bill, refuses more than was sold (counting earlier returns), caps the refund at what the customer paid after discount, and is not callable by anonymous users. `npm run test:db` checks all of that, including that another shop cannot read or write them.
- `/api/cron/notify` refuses to run unless `CRON_SECRET` is set and sent as a Bearer token. It emails each owner only their own shop's summary, to the owner's own address. `/api/notify/summary-now` only ever emails the signed-in user's own address, never one from the request, and is rate limited. Like the report email, this is a documented exception to "no shop data to third parties": the email provider (Resend) sees the summary.
- WhatsApp Cloud API sending is off unless `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID` exist. Until then reminders are one-tap `wa.me` links the owner sends themselves.

## Fingerprint / Face ID sign-in and app lock (034)

- The device proves it holds a private key by signing a one-time challenge; the server checks the signature, the site address (so a look-alike site gets nothing), that the fingerprint/face check happened, and the replay counter, and only then asks Supabase for a one-time sign-in token. Challenges are single-use and expire in five minutes. Tested with real WebAuthn answers, including a wrong key, a phishing address, a replayed answer, a cloned device, a suspended account, and a challenge reused from registration (`tests/passkeys.test.mjs`), and in a real browser engine with a virtual fingerprint reader.
- Only the public key is stored. The tables have no browser access at all (service role only).
- Suspended accounts cannot get back in through a passkey. Platform admins can switch the feature off.
- The app lock is a screen lock on the device (works offline); it does not protect the account on another device.
- Rate limited per address (shared limit in the database, see below).

## Companies / chains (035)

- A company (`organisations`) owns several shops. A company team member gets a `shop_members` row marked `via_org` per shop they cover, so every existing shop policy applies unchanged. Owners and staff cannot create, edit or delete those rows directly (the staff policies and the staff API routes require `via_org is null`); only the team functions can, and they check the caller is the company owner.
- The shop limit (`max_shops`) is enforced by a database trigger and changed only by a platform admin (service role). A stranger cannot insert a shop for someone else's company (`tests/db/orgs.rls.mjs`, 48 checks).
- Known trade-off: adding a team member by email tells the owner whether that email has an account.

## Releases and database access (T01-T03)

- Database updates are applied by `tools/migrate.mjs` from GitHub Actions, one transaction per update, with checksums (an edited applied update fails the run) and read-only checks afterwards (`ops/verify.sql`: row-level security on everywhere, definer functions safe, 028 still in place). Production waits for a required reviewer; the app is released only after the database step is green.
- The database connection strings live only in GitHub environment secrets (`staging`, `production`, `production-readonly`). The weekly drift check uses a login that can read structure and the update list only (`ops/readonly-role.sql`), never shop data.
- Until `DATABASE_CA_PEM` is set, the connection is encrypted but the server certificate is not verified (the run prints a warning). Set it (docs/RELEASE.md).
- Staging holds synthetic data only. The seed refuses a database that has any shop owned by a non-`@staging.nexper.in` account, and never runs unless `NEXPER_ENV=staging`.

## Our own error log (041, T13)

- The app reports unexpected browser errors to `/api/log-error`, stored in `client_errors` for 30 days in our database, not a third-party tracker (page state and URLs would leave our systems). Long numbers and email addresses are removed before storing; a shop is attached only if the sign-in is valid and the person belongs to it. Only platform admins read it (Admin, Errors).

## Support access policy (038, T08/T09)

- Nexper staff read a client's shop data only inside a **support session** (Admin console, Support tab): a ticket reference, a reason, one shop, at most 2 hours. Without an open session of that admin, covering that shop, every read is refused by the database (`support_check`). Reads are from a fixed list of screens (shop settings, members without staff codes, items, a bill, bills in at most 31 days, udhaar balances, one customer's udhaar, day close, expenses, the shop's error reports). No free-form queries, no bulk download. Customers' phone numbers are masked unless the session was opened with "show full phone numbers".
- The log row is written **before** anything is shown; if it cannot be written nothing is shown. `support_access_log`, `support_sessions` and `admin_audit_log` cannot be updated or deleted through the API, not even by the server; they are kept 2 years.
- The owner sees every session on their company (Store settings, "Nexper support access").
- Platform admins must sign in with an **authenticator app** (TOTP); admin API routes refuse a token that is not `aal2`. `ADMIN_MFA_REQUIRED=false` is allowed on staging only. The admin overview no longer returns staff codes.
- **Break glass:** anyone with the Supabase dashboard can still run SQL. Rule: the production SQL editor is used only for an incident, and such use is first recorded as a `break_glass` support session. Supabase organisation members: Maqbool and one backup person, MFA on.

## Closing instead of deleting (037, T07)

- Before, an owner could delete a shop and everything under it with one call from the browser. The delete rule is gone; `close_shop` makes the shop read-only (every write is refused, including by the server, unless a closing/reopening/purging function says so for that transaction), removes staff and company roles from it, revokes its API keys, and sets a purge date 90 days out. Only the owner (or the company owner) can close or reopen. `tests/db/closure.rls.mjs` checks all of it, and the new-table checklist fails the build if a shop table lacks the closed-shop guard.
- The daily purge and the "remove an empty shop now" tool are service-role only, write an audit row per shop, and the second refuses any shop that has bills.

## Multi-tenant isolation and scale (033)

- `tests/db/isolation.rls.mjs` checks every table (35): another shop, an anonymous visitor and a helper without the permission can read, change, delete or insert nothing of shop A's. A new table fails the build until it is added.
- The API silently stops at 1000 rows. Screens that loaded everything were quietly wrong past that (Day close totals, bill numbers, balances, item lists, admin totals). Fixed with date windows, paging and database totals; `docs/ARCHITECTURE.md` has the rule and the measurements.

## Still open (not code)

- Run migrations 024-035 in Supabase. After 028, check:
  `select has_function_privilege('anon','admin_transfer_shop_ownership(uuid,uuid)','execute');` returns false.
- Rate limits are counted in the database (`rate_hit`, update 041) so they hold across server instances; if that call fails they fall back to a per-instance in-memory count. The staff-code lookup is also limited per code (15 in 15 minutes) from any address, because every PIN guess starts with it (the PIN itself is checked by Supabase Auth). Add an edge limiter (Vercel Firewall) before heavy public use.
- Supabase Auth settings to check by hand: email confirmation on, minimum password length 8+, leaked-password protection, redirect URLs limited to the real domains.
- Before taking payments, turn off "Let owners switch plan themselves" in the console (Pricing & tax) so only you can change a plan.
- Staff can read the staff codes of other staff in the same shop (a code alone is not enough to sign in, the PIN is also needed).
- Never put `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` in a `NEXT_PUBLIC_*` variable.

## How to re-check

`npm test`, `node tools/check-i18n.mjs`, `npm audit --omit=dev`, `npx next build`. GitHub runs all four on every push.

## Email me this report (accepted exception)

`app/api/reports/email` sends the signed-in owner's own monthly GST summary or
daily/weekly/monthly sales-and-expenses summary (CSV) to their own sign-in address through Resend. The recipient is never taken
from the request, the caller must be a member of the shop, and it is rate
limited (5 per 10 minutes). Resend therefore sees that shop's totals. This is a
deliberate exception to "no shop data to third parties"; it only happens on the
owner's click. Needs `RESEND_API_KEY` (Vercel Secret) and optional `EMAIL_FROM`.
## Accepted audit finding (2026-10-05)

`braces` (GHSA-vfj7-8cjw-p6xm, high, DoS on deeply nested glob patterns) has no
fixed release. It is only used by build tooling on our own config, never on user
input. CI uses `tools/audit.mjs`, which fails on any other high/critical finding.
Re-check when braces publishes a fix.

The Reports "Share report" tab also builds a WhatsApp text in the browser and
opens `wa.me`; the owner picks the chat, nothing is sent by the server.

## Google sign-in button (accepted change)

The login page loads Google's sign-in script (`accounts.google.com/gsi/client`) so
the Google popup shows "Nexper" instead of the Supabase address. CSP allows only
`accounts.google.com/gsi/` for script, frame, style and connect, and COOP is
`same-origin-allow-popups` (Google's popup needs it). Google sees that someone
opened the login page; no shop data is sent. The ID token is checked by Supabase
with a one-time nonce. The older redirect button stays as a fallback.
