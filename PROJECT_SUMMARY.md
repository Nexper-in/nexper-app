# Nexper — Project Summary

Current state of the build, as of 2026-09-04. `PROJECT_BRIEF.md` and
`README.md` describe the original plan; this file describes what actually
exists now, since the two have diverged (most notably the shared-catalog
data model, the staff/roles system, and the vendor-payables features
below, none of which were in the original brief).

**Note — architecture pivot (2026-09-04): one owner, one shop.** Nexper
originally let one owner account run several shops (a shop switcher, an
"Add shop" flow, a combined multi-store dashboard — see the note below
this one). That's been reversed: each owner now gets exactly **one** shop,
chosen at signup, enforced by a `shops.owner_id` unique constraint at the
database level (`supabase/migrations/013_one_shop_per_owner.sql`) —
different stores need different owner logins. The shop switcher, "Add
shop" button, and the combined dashboard have been removed; onboarding
(the "Set up your shop" screen right after signup, already asked for
business type + name) is now the *only* way a shop gets created, and it
only ever runs once per account.

The project's own dev/test data — one account with 4 shops (SabStore,
Trendy Boutique, Speed Auto Parts, SabStore Demo) plus a second account
with 2 more (Sabstore, City Supermarket) — was split into 6 separate
owner logins, one shop each, to match (`supabase/migrations/012` +
`012b`). Two wrinkles worth knowing if this pattern comes up again:
each of the 4 newly-created owners also clicked through "Set up your
shop" themselves before the reassignment landed, creating an accidental
duplicate shop each time — `012b` cleans those up by exact id. And the
original 4-shop account's data migration was first written against the
wrong email (`maqbooln2022@gmail.com`, which turned out to own the
*second* multi-shop account, not the first) — worth double-checking
which login actually owns what before writing an ownership-reassignment
migration, rather than assuming.

Note: the multi-store combined dashboard and vendor payables were
originally scoped as a separate app ("Store Manager", its own spec —
see git history around 2026-09-01 for `app-summary.md`) before being
folded into Nexper's own owner dashboard instead, on the reasoning
that Nexper already had the login and multi-shop model these features
needed. The multi-store dashboard piece was later removed entirely by
the pivot above; vendor payables (Suppliers) is shop-scoped regardless
of the owner model and was unaffected.

Note: a user-initials avatar badge was added to the sidebar/topbar as a UI
polish pass, and the request that prompted it also named a batch of
possible new features. Four were scoped and confirmed via follow-up
questions: FIFO stock rotation (full batch tracking — built, see below),
quick clearance offers (time-boxed discounts — built, see below), daily
high-risk category tracking (items nearing expiry — built as part of FIFO
batch tracking below, since it depends on the same per-batch expiry data),
and deeper WhatsApp Business API integration (not yet built — owner has
API access but credentials haven't been collected yet).

## What it is

A billing, inventory, and udhaar (credit) management app for small Indian
retail businesses (kirana stores, supermarkets, automobile/auto-parts
shops, clothing boutiques, or any other business). Each owner runs
exactly one shop — picking its business type and name as the first thing
they do after signing up — with its own inventory, bills, credit ledger,
and cash tracking, and can bring on staff who get a real login and
limited, per-feature permissions.

## Stack

- **Frontend**: Next.js 14 (App Router, JavaScript), Tailwind CSS, a custom
  design system ported from the original prototype (`ks-*` classes in
  `app/globals.css`).
- **Backend**: Supabase — Postgres with Row Level Security, Supabase Auth
  (email/password for owners, a PIN-based flow for staff built on top of
  real Supabase auth accounts).
- **Hosting**: Vercel, auto-deploys on push to `main`.
- **Repo**: [github.com/maqbooln2022-prog/SabStore](https://github.com/maqbooln2022-prog/SabStore)

## Data model

Two-tier "shared catalog" design:

- **Owner-level master data** — `products`, `suppliers`. Belongs to the
  owner (`owner_id`), not to any single shop, so the same item or supplier
  can be reused across every shop that owner runs.
- **Shop-level instance data** — `shop_products` (price, cost, GST, stock,
  low-stock threshold, quick-add flag for one shop's copy of a product),
  `shop_suppliers` (which suppliers serve which shop).
- **Everything else is shop-scoped**: `bills`, `movements`, `credits`,
  `reconciliations`, `draws`, `expenses`.
- **`shop_members`** ties a Supabase auth user to a shop with a role
  (`owner`/`staff`) and a `permissions` jsonb map, one key per module.
- **`shops.enabled_modules`** is a shop-level on/off switch per module,
  independent of any individual staff member's permissions.

Full schema, RLS policies, and the SECURITY DEFINER helper functions that
back them: `supabase/schema.sql`. Incremental changes since the initial
schema are in `supabase/migrations/001` through `004`.

## Auth & roles

- **Owners** sign up/sign in with email + password, pick their shop's
  business type and name once (right after signup — see the pivot note
  above), and get full access to every enabled module on that shop.
- **Staff** get a real, separate Supabase auth account (a short staff code
  + a 6+ digit PIN as their password), created server-side by the owner
  via `app/api/staff/create` using the Supabase service-role key. They see
  only the modules the owner both enabled for the shop and granted to
  them personally.
- Permissions are enforced in Postgres RLS, not just hidden in the UI — a
  staff member without a permission can't read or write that data even via
  a raw API call.

## Features built

- **Shop onboarding** (`components/ShopOnboarding.js`) — the one-time,
  unskippable screen a brand-new account lands on: pick a business type
  (kirana/supermarket/automobile/clothing/other, driving sensible
  defaults) and a shop name, with an optional toggle to seed a generic
  starter catalog for that business type. Runs exactly once per account
  — see the one-owner-one-shop pivot note above.
- **Inventory** — add/search items by name or code, category chips, stock
  in/out with reason + optional supplier, margin display, reorder
  suggestions based on sales pace.
- **Billing** — quick-add tiles, search by name/code, unit-aware quantity
  entry, voice billing (Web Speech API), cash vs. udhaar toggle, loyalty
  discount prompt on repeat customers, printable receipt, WhatsApp send
  (via `wa.me` deep link — see Known limitations).
- **History** — past bills, searchable/filterable.
- **Udhaar (credit) book** — per-customer running balance, record
  payments, WhatsApp reminders.
- **Day Close** — daily cash reconciliation and personal draw log. The
  expected-cash total now carries forward an opening float from the
  most recent prior close's counted amount (no schema change — it's
  just the newest `reconciliations` row that isn't today's own), rather
  than assuming the till starts at zero every day.
- **Expenses** — a tab toggle between the original one-off expense log
  and **fixed monthly costs** (`fixed_expenses`, `supabase/migrations/009`)
  — standing recurring definitions (rent, salary, subscriptions: amount
  + due day), separate from the log since they aren't tied to one
  payment event.
- **Cashbook**.
- **Suppliers** — owner-level supplier list, linked per shop, each link
  carrying its own payable balance (`shop_suppliers.owed` —
  `supabase/migrations/008`): log a purchase (increases owed, goods on
  credit), record a payment (decreases owed, logs a real cash-out that
  flows into Cashbook automatically via the `expenses` table), or log a
  return/debit note (decreases owed, no cash movement).
- **Dashboard** — today's sales/profit hero, clickable stat cards (items in
  stock, stock value, low stock, today's profit) with detail breakdowns,
  an "Add items" shortcut when a shop's inventory is empty, top customers.
- **Staff management** (owner-only) — add/edit/remove staff, set a name,
  PIN, and per-module permission checklist; staff sign in from a dedicated
  "staff" tab on the login page using their staff code + PIN.
- **Atomic stock updates** — selling an item or adjusting stock goes
  through a row-locked Postgres RPC (`sell_items`/`adjust_stock`,
  `supabase/migrations/005`) instead of a plain client read-then-write, so
  two concurrent sales of the same item can't both oversell it. Sales now
  also log a `movements` row, same as manual stock adjustments.
- **FIFO batch tracking & expiry risk** (`stock_batches`,
  `supabase/migrations/010`) — every "stock in" creates a dated batch row
  (qty, cost, optional expiry, supplier); `adjust_stock`/`sell_items` were
  extended to consume batches oldest-first under the same row lock used
  for the stock update, so a sale or manual stock-out always draws down
  the longest-sitting stock first. Inventory has a per-item "View batches"
  panel (oldest batch flagged "NEXT TO SELL", used-up batches greyed out,
  expiry color-coded). The Dashboard surfaces a "today's risk check" card
  listing any batch expiring within 14 days across the active shop, so an
  owner sees what to discount or pull before it's wasted, without having
  to open every item individually.
- **Quick clearance offers** (`clearance_offers`/`clearance_offer_items`,
  `supabase/migrations/011`) — owner-only page at `/clearance`: pick
  items, a discount %, a start/end date. "Active" is computed purely from
  today's date falling in that range — no enable flag, no cron job — so
  Billing (any staff member with billing access) reads it live and the
  discount auto-applies the day it starts and auto-reverts the day after
  it ends. Billing shows the struck-through original price, the
  discounted price, and a running "clearance savings" total; the actual
  discounted price is what gets billed. The Dashboard's expiry risk card
  has a "Run clearance offer" shortcut that deep-links into `/clearance`
  with the at-risk items pre-selected, since expiring batches are the
  obvious source of what to put on clearance.
- **Offline write queue** — bill/credit inserts and both stock RPCs go
  through `lib/offlineQueue.js`, which queues to localStorage when the
  device is offline (or a request can't reach the network) and retries on
  reconnect, with a sidebar badge showing pending-sync count. Not a full
  sync engine — no conflict resolution, last-write-wins.
- **Platform admin page** (`/admin`, `supabase/migrations/006`-`007`) —
  a global role separate from shop owner/staff, granted via a
  `platform_admins` table (SQL-editor-only for now, no self-serve UI to
  grant it). Shows every owner on the platform with their shops, signup
  date, bill counts, and each shop's full member roster (owner + staff,
  with platform-wide and per-shop owner/staff login counts). Can
  suspend/reinstate an owner's login (real Supabase Auth ban, not a UI
  flag), delete any shop platform-wide, edit any member's name/
  permissions/password, or transfer a shop's ownership to a different
  existing member (one atomic Postgres function moves `shops.owner_id`
  and both members' roles together, so a shop can't end up ownerless).

## Security posture

A full review was done and all findings fixed:
- Products/suppliers RLS scoped to the specific shop a row is linked to,
  not just "any shop this owner runs," and requires the relevant
  permission for writes.
- Staff login lookup rate-limited (best-effort, in-memory — see
  `lib/rateLimit.js` for the serverless caveat).
- Staff codes generated with a CSPRNG (`crypto.randomInt`), not
  `Math.random()`.
- `shop_members` update/delete RLS can't touch an owner's own row, only
  staff rows.
- The service-role key is only ever used server-side, in `app/api/staff/*`
  route handlers, verified against the caller's bearer token first.

## Known limitations / deferred

- **Cash vs. card/UPI/wallet split on bills** — the last piece of the
  Store Manager till-reconciliation concept (tagging each payment as
  cash-drawer vs. not, so Day Close's expected-cash math excludes
  non-cash tender automatically). Bills currently only distinguish
  `cash` vs. `credit` (udhaar); adding payment-method granularity means
  changing the core Billing flow, which carries real regression risk to
  already-verified, high-traffic functionality — deliberately not done
  without a separate go-ahead. The other three Store Manager pieces
  (combined dashboard, supplier payables, fixed costs, opening float)
  didn't touch Billing at all.
- **WhatsApp Cloud API** — bills/reminders/digests currently use `wa.me`
  deep links (pre-fills a message, owner taps send manually), not
  automatic sending. Correct for phase 1 per `PROJECT_BRIEF.md`. Deeper
  integration (sending directly via the Meta WhatsApp Business API) is
  confirmed in scope for a future pass — the owner has API access, but
  the actual access token/phone number ID haven't been collected yet.
- **Low-stock alerts** are in-app only; no push/SMS channel yet.
- **Offline support is partial** — bill/credit inserts and stock updates
  queue and retry, but that's a localStorage retry queue, not real
  offline-first sync: no conflict resolution, and other reads/pages still
  need a connection.
- Rate limiting is in-memory per serverless instance, not a durable/
  distributed limiter — fine as a speed bump, not for a serious attack.

## Running locally

1. `npm install`
2. Create a Supabase project, run `supabase/schema.sql` in its SQL editor
   (fresh install) — or the migration files in order if updating an
   existing project.
3. Copy `.env.example` to `.env.local`, fill in `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (the
   last one only needed for staff account creation — keep it secret,
   server-side only).
4. `npm run dev`, open `http://localhost:3000`.

Same three env vars need to be set in the Vercel project's dashboard for
the deployed app to work — `.env.local` is git-ignored and never deployed.
