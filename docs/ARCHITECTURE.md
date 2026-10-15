# Nexper: how many customers share one system

Short version: **one database, one set of tables, every customer ("shop") separated by a
`shop_id` and by row-level security.** There is never a table per customer. This note says
what that means, what is guaranteed and tested, how far it scales, and when to do
something different.

## 1. The model

- A **tenant is a shop** (`shops`). Almost every table has a `shop_id`; the rest hang off
  one that does (`purchase_order_items` via its order, `clearance_offer_items` via its
  offer) or off the owner (`products`, `suppliers`, shared by that owner's shops).
- People belong to a shop through `shop_members`: one `owner`, any number of `staff`, each
  with a per-screen permission list. Staff are real sign-in accounts (code + PIN).
- The platform itself (pricing, switches, invites, API keys, audit log, platform admins) is
  in a few shop-less tables that only the server and platform admins can touch.
- Since migration 035 shops belong to a company (`organisations`) so one owner can run a
  chain; see `docs/CHAINS.md`. Each shop is still its own tenant.
- Adding a customer adds rows, never tables. A schema change is one migration for everyone.

## 2. How separation is enforced

1. **Row-level security on every table** (Postgres, not the app). A signed-in user is
   tied to shops by `shop_members`; policies call `is_shop_member`, `has_shop_permission`
   and `is_shop_owner`. The browser holds only the public key, so the rules are the only
   gate and they cannot be skipped by editing the page.
2. **Permissions are enforced by the database too**, not only hidden in the menu (a helper
   without the Udhaar permission cannot read credit entries, even by calling the API).
3. **The service-role key lives only in `app/api/**`**, after a sign-in check, and every
   such route scopes its query to the caller's own shop. It is never in the browser.
4. **Writes that need rules go through functions** (`sell_items`, `save_supply_round`, ...)
   which check the caller and take prices from the shop's own data.

## 3. What is tested (runs on every push)

`npm run test:db` loads the real schema and every migration into an in-memory Postgres and
checks, as real database roles:

- **Every table** (35 today): row-level security is on; shop B's owner and an anonymous
  visitor cannot read, change, delete or insert into shop A's rows; a helper without the
  permission cannot read permission-scoped tables; the rightful owner still can.
- **A new table fails the build until it follows the checklist**
  (`tests/db/catalog.mjs`, `tests/db/tables.mjs`, `tests/db/isolation.rls.mjs`): row-level
  security on, classified (kind and lifecycle), and if it holds shop data a cascading
  `shop_id` foreign key, an index starting with `shop_id` and an isolation entry. Every
  `security definer` function must set `search_path` and refuse anon. The test also proves
  each rule fails on a deliberately broken table.
- **Large shops**: a synthetic shop with 40,000 bills (150,000 when run by hand) stays fast
  under the real access rules (`tests/db/scale.mjs`).

## 4. How far it scales

Measured on one shop with **150,000 bills**, 75,000 credit entries, 50,000 stock
movements, as the shop's owner under the access rules:

| Question | Before | After |
| --- | --- | --- |
| Newest 200 bills | 1,300 ms | 6 ms |
| Today's bills | 64 ms | 12 ms |
| Newest 6 stock movements | 425 ms | 1 ms |
| Every bill ever (what the old screens did) | 5,000 ms and about 20 MB | no screen does this now |

What changed (migration 033 and the screens):

- **The API returns at most 1,000 rows and stops without an error.** Screens that loaded
  "everything" were silently wrong past 1,000 bills (Day close totals, bill numbers,
  balances). Screens now ask for a window (today, 35 days, newest 100) or read page by
  page when they truly need every row (`lib/fetchAll.js`). **Rule: never read a growing
  table without a window or `fetchAll`.**
- Indexes on `(shop_id, date)` for the large tables and a partial index for expiries.
- Platform totals (admin page) are summed in the database.

**Per-day summary** (migration 043): `shop_day_stats` has one row per shop per Indian day (bills, sales by payment method, returns, udhaar received, expenses, GST, cost), kept current by triggers and rebuilt by `refresh_shop_day_stats`. The nightly summary uses it and runs in batches of 100 shops every 10 minutes through the evening (`shops.summary_sent_on`), so it no longer has to finish every shop in one 60-second run. Chain-wide analytics (CHAINS.md phase 2) read it too.

Still reads all history on purpose, correct but not free: **Cashbook** (running balance),
**Udhaar** and **Home** (balances need every credit entry). Fine to tens of thousands of
rows. When a shop gets there, move balances into a small summary table or a database
function; nothing else needs to change.

## 5. Safety of the data

- **Backups**: Supabase's free plan has no point-in-time recovery. Real clients need the
  Pro plan (or better) and one test restore. Check the project **region is Mumbai
  (ap-south-1)**: it cannot be changed later without moving the data.
- **Owner backup**: Store settings, "Download backup": a zip of spreadsheets built from the owner's own session (`lib/exportData.js`), so it can only contain their shop.
- **Closing a shop** (migration 037) replaces deleting: the shop becomes read-only (a guard
  trigger on every table of its books), staff and company roles lose access, the owner keeps
  access to download everything and can reopen it for 90 days. A daily job (`/api/cron/purge`)
  then removes it with everything under it (`on delete cascade`), one audit row per shop. No
  browser or app code can delete a shop; only that job and a support tool for shops that never
  had a bill.
- Support access: platform admins can see all shops. Their actions are logged; reading is
  not. Decide and state when support may look at a client's data.

## 6. When to do something different

- **Shared tables are right** for thousands of small shops. They stop being right for a
  client that contractually needs its data in a separate system or region (a hospital
  group, a chain with its own compliance rules). Then: **give that client its own Supabase
  project and its own deployment of the same code** (set that project's URL and keys).
  Nothing in the app assumes a single database.
- **One owner with several shops** is supported since migration 035 (companies, see
  `docs/CHAINS.md`); the shared model still holds, the company layer only connects shops.
- Rate limiting is in memory (per server instance). Use a shared store before heavy public
  use.
