# Nexper multi-tenant design (v1, 2026-10-11)

Status: **decided design, ready to build.** Written for the person (or model) who implements
it. Every section gives a decision, not a menu. Where I disagree with the recommendations I
was given, it says so and why. Estimates are labelled as estimates and show the arithmetic.

Read with: `docs/ARCHITECTURE.md` (the shared-table model and what is tested),
`docs/CHAINS.md` (companies), `SECURITY.md`, `CLAUDE.md` (rules for every change).

Facts checked in the repo for this document (so nobody has to assume them):

- There is **no `bill_items` table.** Bill lines live in `bills.items` (jsonb). "Credit
  entries" are `credits`, "stock movements" are `movements`. `sell_items()` writes one
  `movements` row per bill line, so `movements` grows about 4x faster than `bills`.
- Measured in PGlite with the real schema (2026-10-11, 20,000 bills of 4 lines): a bill row
  with its indexes is **about 1.35 KB**, a movement about **0.2 KB**, a credit entry about
  **0.3 KB**. So one 4-line bill costs about 1.35 + 4 x 0.2 = **2.15 KB** on disk.
- Migration numbers have a gap (no 032) and one odd name (`012b_...`). The runner below must
  accept both.
- `bills` and `credits` already have **no delete or update policy**: ledgers are append-only
  for shop users. Shops themselves can be **hard-deleted from the browser** by the owner
  (`ShopContext.deleteActiveShop`, policy "Owners can delete their shops"), and by a platform
  admin (`/api/admin/delete-shop`). Both cascade everything immediately.
- Platform admins read shop data only through `app/api/admin/*` with the service role (no
  RLS policy grants them anything). Today those routes return shop lists, member names,
  emails, **staff codes**, bill counts. The Supabase dashboard SQL editor is the other,
  unlogged, read path.

Problems found while reading the code (each is fixed by a task in section 6):

| # | Finding | Effect | Fixed by |
| --- | --- | --- | --- |
| F1 | Saving a bill is three separate, non-idempotent writes (`sell_items` rpc, `bills` insert, `credits` insert) queued independently by `lib/offlineQueue.js`. A replay after a timeout (request reached the server, answer lost) deducts stock twice and adds the udhaar charge twice. A replayed bill insert hits the primary key (`23505`), which the queue mistakes for a bill-number clash, so it stays stuck in the queue forever. | Wrong stock and wrong udhaar balances on flaky shop Wi-Fi | T14 |
| F2 | `lib/aiGuard.js` picks the user's first shop (`limit(1)`) for the AI quota. | Chains and multi-shop users are charged to the wrong shop | T11 |
| F3 | `ShopContext.loadOrg` reads the first organisation by date, not the active shop's. | A manager of company X who also owns a shop sees the wrong company | T12 |
| F4 | Owner can permanently delete a shop with one call; no undo. | Largest single data-loss risk we have | T07 |
| F5 | `/api/cron/notify` takes at most 500 shops and works through them one by one inside `maxDuration = 60` s. | Estimate: at about 0.3 s per shop it stops finishing at roughly 200 opted-in shops | T15 |
| F6 | `vercel.json` sets no function region. Vercel's default is a US region (believed `iad1`, verify). The database should be in Mumbai. | Every API route crosses the world twice; shop data processed outside India | T04 |
| F7 | `org_set_member` looks users up by email and does not refuse internal staff accounts (`staff-XXXX@workers.nexper.internal`). | A staff login could be made a company manager | T12 |
| F8 | `/api/admin/overview` returns staff codes. | Unneeded exposure | T09 |
| F9 | `admin_audit_log` is not append-only for the service role. | Audit can be edited | T08 |
| F10 | Staff PIN sign-in is rate limited per IP only, in memory. | A distributed guess of a 6-digit PIN for one staff code is not slowed | T13 |

---

## 1. Decision summary

1. **Shared database, shared tables, `shop_id` + row-level security stays the base** for every
   shop on the standard plan. No table-per-shop, no schema-per-shop.
2. **The company (organisation) is the billing tenant.** Plan, expiry, limits and feature
   overrides move to a new `org_controls` row per company; per-shop `tenant_controls` remain
   only as support overrides. The shop stays the data tenant; the company is the support and
   contract tenant.
3. **Migrations are applied by our own small runner** (`tools/migrate.mjs`), the same code
   the database tests already use, recording each file in a new `app_migrations` table. Not
   the Supabase CLI (reasons in 3.5).
4. **Three environments: dev (PGlite + mocks), staging (its own Supabase project in Mumbai,
   synthetic data only), production.** A merge to `main` migrates staging automatically;
   production migrates only after Maqbool clicks **Approve** in GitHub, and only then is the
   `production` branch moved, which is what Vercel deploys. Maqbool never pastes SQL again.
5. **Supabase Pro now** (before the first paying shop), region verified as Mumbai, Vercel
   functions pinned to Mumbai (`bom1`). PITR is bought when revenue covers it (trigger in 3.12).
6. **Backups: Supabase daily backups + a weekly encrypted dump kept outside Supabase** (S3,
   Mumbai). RPO 24 h, RTO 4 h for the whole database until PITR. A restore is tested every
   quarter with a written runbook.
7. **Per-shop restore = full-fidelity shop export/import tool + "restore backup to a scratch
   project, extract one shop" runbook**, plus closure-with-grace instead of hard delete, plus a
   30-day trash for deleted rows. No nightly per-shop snapshots.
8. **Support access only through audited support sessions**: ticket reference, reason,
   2-hour maximum, one shop or one company, every read logged before data is returned,
   phone numbers masked by default, visible to the owner, admins must use MFA.
9. **Shops are closed, not deleted.** Closed = hidden, read-only, exportable, restorable for
   90 days, then purged by a job. Purge is the only hard delete.
10. **Bills are saved by one idempotent database function, `save_bill`**, keyed by the bill's
    client-generated id. Offline replays become harmless.
11. **`shop_day_stats` is built now** (one row per shop per IST day), filled by triggers and a
    nightly catch-up. It feeds chain analytics, the nightly summary, admin usage and later
    Home/Reports.
12. **Rate limits move to Postgres** (`rate_hit()` on an unlogged table); no Redis/Upstash until
    a measured need. Supabase's default statement timeouts stay and are verified.
13. **Observability stays inside our own systems:** client errors and usage go to our own
    tables; no third-party error tracker (it would receive shop data).
14. **Enterprise silo = a separate Vercel project + separate Supabase project running the same
    code from the same branch**, migrated by the same runner as one more GitHub environment.
    Built only when a client signs; this design only keeps it from needing a rewrite.
15. **Every new table must pass an automatic checklist test** (RLS, isolation test entry,
    `shop_id` foreign key with cascade, leading `shop_id` index, classified retention,
    definer functions locked down). The build fails otherwise.

---

## 2. The tenancy model

```
PLATFORM (Nexper)                     platform_settings, platform_admins, admin_audit_log,
 |                                    support_sessions, support_access_log, app_migrations,
 |                                    rate_limit_hits, client_errors, tenant_invites
 |
 +-- COMPANY  (organisations)         org_controls (plan, expiry, limits, overrides, billing)
 |    |  billing tenant,              org_members (owner / manager / area_manager / analyst)
 |    |  support tenant               max_shops
 |    |
 |    +-- owner-level master data     products, suppliers (keyed by owner_id; shared by the
 |    |                               owner's shops)
 |    |
 |    +-- SHOP (shops)                tenant_controls (support overrides only), api_keys
 |         |  data tenant             bills, credits, movements, shop_products, stock_batches,
 |         |                          expenses, ..., shop_day_stats, deleted_rows
 |         |
 |         +-- PEOPLE (shop_members)  owner (direct), staff (code + PIN, one shop only),
 |                                    company roles copied in as via_org rows
 |
AUTH USER (auth.users)                one person; owns at most ONE company; may be a member
                                      of any number of shops in any number of companies
```

| Question | Answer |
| --- | --- |
| Who is the tenant **for data** (isolation, RLS, export, restore, closure)? | The **shop**. Every row is reachable from a `shop_id` (or the owner for master data). |
| Who is the tenant **for billing** (plan, expiry, invoice, quotas)? | The **company**. A single-shop owner is a company of one (already true since 035). |
| Who is the tenant **for support** (who may ask, who is told)? | The **company owner** (and the shop owner, who is the same person today). A support session targets one shop or the whole company. |
| Who is the tenant **for a contract / silo**? | The **company**. A silo holds one company. |

Where each setting lives:

| Setting | Lives in | Who writes | Who reads |
| --- | --- | --- | --- |
| Prices, GST, plan definitions, kill switches, sign-up mode | `platform_settings` | platform admin (API) | everyone (public read, as today) |
| Company plan, expiry, limits, feature overrides, billing name/GSTIN/email, deployment | `org_controls` (new, 039) | platform admin (API) | company members |
| Shops allowed per company | `organisations.max_shops` (exists) | platform admin | company members |
| Per-shop support override (plan, limits, features, API/MCP switches) | `tenant_controls` (exists) | platform admin | shop members |
| Shop's own settings (name, modules, UPI, reminders) | `shops` | shop owner | shop members |
| Legacy self-switched plan | `shops.plan` (023) | owner while self-switch is on | evaluation fallback only |

---

## 3. Decisions

Each item: **Decision**, **Why**, **Rejected** (and why), **Cost / effort**.

### 3.1 Question 1: plan and billing owner

**Decision.** Agree with the recommendation, with three precisions.
- New table `org_controls` (one row per company) holds `plan`, `plan_expires_at`, `limits`,
  `feature_overrides`, `billing_name`, `billing_gstin`, `billing_email`, `deployment`
  (`'shared'` or a silo name), `notes`. Platform admin writes; company members read.
- Evaluation order (one function, used by browser and server):
  - **Plan:** shop override (`tenant_controls.plan`, `free` once expired) → company plan
    (`org_controls.plan`, `free` once expired) → legacy `shops.plan` → `free`.
  - **Feature:** global kill switch off → `false`; shop override → company override →
    if plans not enforced: on (except `api_access`, `mcp_access`); else the plan's list.
  - **Limit:** shop override → company override → if not enforced: none; else the plan's.
- **Staff limit stays per shop** (`maxStaff` means staff per shop). **AI scans are pooled per
  company** (counted over all the company's shops), unless a shop override sets the limit, in
  which case that shop is counted alone.
- Backfill creates **no company plans** (all `org_controls.plan` null), so evaluation falls
  through to today's per-shop values and nothing changes for anyone on the day it ships.

**Why.** CHAINS.md already defaults to one subscription per company; one invoice and one
GSTIN per paying customer matches how shops pay; a chain should not have to buy N plans.

**Rejected.** Keeping plans per shop: a 20-shop chain would need 20 plan edits and 20
invoices, and quotas would be split arbitrarily. Moving `max_shops` into `org_controls`:
it is already enforced by a trigger on `organisations`; moving it gains nothing.

**Cost.** About one day (T10, T11). One migration (039).

### 3.2 Question 2: support access

**Decision.** Agree, and tighten it.
- Admin reads of any shop data (anything beyond the account list: names, emails, shop names,
  plan, counts) only through `/api/admin/support/*`, and only inside an open
  `support_sessions` row: ticket reference (required), reason (10 to 300 characters), target
  (one shop or the whole company), `kind` = `support` or `break_glass`, expiry at most
  **2 hours** (default 60 minutes), optional `unmask_phones` (default off).
- Each support read goes through an **allow-list of resources** (shop settings, members
  without staff codes or PINs, items, a bill by number, bills in a window of at most 31 days and
  500 rows, udhaar balances, one customer's udhaar, day close, expenses window, the shop's
  client errors). No free-form SQL, no "download everything".
- **The log row is written before any data is returned. If the log write fails, no data is
  returned** (fail closed).
- Admins must sign in with **MFA (TOTP)**; `requireAdmin` checks `aal2` in the token.
- **The owner sees every session** (Store settings, "Nexper support access": when, who,
  ticket, reason, how many screens viewed). No prior approval step (see open question 2).
- The overview stops returning staff codes (F8). `admin_audit_log` and `support_access_log`
  become append-only even for the service role (F9). Both kept 2 years.
- **What this cannot stop:** anyone with the Supabase dashboard can still run SQL. Rule
  (written into SECURITY.md): the production SQL editor is used only for incidents; such use is
  recorded as a `break_glass` session in the console first. Supabase organisation members kept
  to Maqbool and one backup person, MFA on.

**Why.** DPDP expects reasonable security safeguards and logs that show who accessed personal
data (the Rules as I understand them ask for logs to be kept at least one year; verify with a
lawyer). The owner-visible list builds trust with shopkeepers and is cheap.

**Rejected.** Read-only RLS policies for platform admins (`is_platform_admin()` in every
policy): every read would be possible from the browser and impossible to log. Logging every
query via `pgaudit`: logs land in Supabase logs with short retention, not reviewable by the
owner, and do not cover the reason or ticket.

**Cost.** About one and a half days (T08, T09). One migration (038).

### 3.3 Question 3: restoring one shop

**Decision.** Four cheap layers, one runbook.
1. **Close instead of delete** (T07): removes the one-click total loss (F4). Restorable for 90
   days by the owner (Reopen) or support.
2. **Trash for deleted rows** (T16): an `AFTER DELETE` trigger on the tables shop users can
   delete from copies the old row (as jsonb) into `deleted_rows`, kept 30 days; support
   restores a row with one function. Covers "I deleted my items / supplier / staff by mistake".
3. **Full-fidelity shop export/import** (T06): `tools/shop-export.mjs` writes one shop (and
   the owner's products/suppliers it uses) as NDJSON with original ids;
   `tools/shop-import.mjs` loads it into any database in `missing-only` (default) or
   `replace` mode, with a dry run that prints counts per table. The owner's backup zip gets the
   same rows as `data.json`, so an owner's own backup becomes restorable by support.
4. **Point-in-time for one shop** (runbook in T05/T06): restore the backup (or later PITR) into
   a scratch Supabase project, run the export for that shop against it, import into
   production with `missing-only` or `replace`, delete the scratch project. Run as a GitHub
   Action ("Restore one shop") that needs Maqbool's approval, so no laptop holds production
   credentials.

**Why.** Most real incidents are one shop's mistake, not a database loss. Layers 1 and 2 fix
those without any backup. Layer 3 is needed anyway for DPDP portability and for moving a
company into a silo, so it is built once and reused three ways.

**Rejected.**
- *Restore from the owner's CSV zip*: lossy (no ids, bill lines flattened to text, no batches).
  Fixed instead by adding `data.json`.
- *Soft-delete columns on every table*: every query and policy would need `deleted_at is null`;
  high risk of a forgotten filter. The trash table gets the same benefit with triggers only.
- *Nightly per-shop snapshots*: at 1,000 shops that is 1,000 files a night of personal data in
  a second store with its own retention and access rules. Not worth it before a contract asks.
- *PITR now*: about USD 100 a month (Supabase list price as I know it, verify), more than the
  whole revenue of the first 100 shops at Rs 99. Bought later (3.12).

**Cost.** About two days (T06, T07, T16) plus the runbook.

### 3.4 Question 4: dedicated project ("silo") for enterprise

**Decision.** Silo = **separate deployment**, not routing inside one deployment.
- One extra Vercel project from the same repo and the same `production` branch, its own
  domain (`<client>.nexper.in` or the client's), its own env vars; one extra Supabase project
  (Mumbai, Pro). Nothing in the code may hard-code a project URL, a key or `app.nexper.in`
  (T19 audits and fixes this; today only links to the marketing site and comments do).
- **Migrations:** one more GitHub environment (`silo-<name>`) with its own `DATABASE_URL`; the
  production release workflow migrates every production-class environment in a matrix after the
  one approval. Same files, same order, same `app_migrations` check, so silos cannot drift.
- **Admin and billing:** each silo has its own `/admin` and `platform_settings` (the client's
  admin can be us). The shared console marks the company `org_controls.deployment = '<name>'`
  and the company is invoiced by contract, outside the app. A `/api/health` endpoint
  (token-protected, returns app version and database version only) lets us check every
  deployment's version from one place.
- **Moving a company in:** shop export from shared, import into the silo, close in shared.
- Passkeys are bound to the hostname, so silo users register their own (no change needed).

**Why.** `NEXT_PUBLIC_*` values and the CSP `connect-src` are fixed at build time
(`next.config.js` builds `connect-src` from `NEXT_PUBLIC_SUPABASE_URL`). Routing one deployment
to many Supabase projects would need runtime config, a multi-origin CSP and per-request client
creation: a large change for a customer we do not have yet.

**Rejected.** Tenant routing by hostname in one deployment (above). A separate code branch per
silo (drift). Building silo tooling now (no customer; YAGNI).

**Cost.** Prep: half a day (T19). Per silo when sold: about 1 day of setup; infra estimate
USD 10 to 135 a month (Micro compute about USD 10, plus PITR about USD 100 if the contract wants
it, plus a staging copy if they want one). Price accordingly (open question 6).

### 3.5 Migration process

**Decision.**
- `tools/migrate.mjs` (Node, `pg` client, dev dependency) applies `supabase/migrations/*.sql`
  in file-name order to the database in `DATABASE_URL`. The **same function**
  (`applyMigrations`) is imported by `tests/db/setup.mjs`, so what CI tests is what runs.
- `app_migrations(version, name, checksum, applied_at, applied_by)` records each file. Every
  migration from 036 on ends with `select record_migration('<version>', '<file name>');`, so
  a file pasted by hand into the SQL editor (emergency fallback) records itself too.
- Rules the runner enforces: takes an advisory lock (no two runs at once); `set lock_timeout =
  '5s'` and `statement_timeout = '10min'`; files 036+ run each in one transaction and must not
  fail (no tolerated errors); files up to 035 keep today's "already exists" tolerance and run
  only on an empty database; a file whose checksum changed after being applied fails the run
  ("never edit an applied migration"); `--dry-run` lists what would run. A file that cannot run
  in a transaction (for example `create index concurrently` on a big table) starts with the
  line `-- nexper:no-transaction`.
- **Order of a release: database first, then app.** Every migration must work with the app
  version already live ("expand, then contract": add columns/tables now, drop old ones in a
  later release, marked `-- nexper:contract`). Code that needs a migration still fails politely
  (existing rule), now via `db_version()`.
- Production connection: Supabase **session pooler** connection string (port 5432 on
  `aws-0-ap-south-1.pooler.supabase.com`, copy it from the dashboard's Connect button). The
  direct `db.<ref>.supabase.co` host is IPv6 only without the IPv4 add-on, and GitHub runners do
  not reach IPv6 reliably (verify).

**Rejected: Supabase CLI `db push`** (the recommendation). It accepts only
`<digits>_name.sql` (so `012b_...` is skipped), keeps its own tracking table that does not know
what was run by hand, and stops on the first error, so the existing history (which relies on
"already exists" being tolerated on top of `schema.sql`) cannot build a fresh staging database
without first squashing it into a baseline dump. Adopting it means rewriting history for no
gain. Revisit if we ever start a fresh project.

**What Maqbool does per release** (and nothing else):

1. GitHub emails "Deployment review: production is waiting". Open the link.
2. Open `https://staging.nexper.in`, sign in with the staging test account, and do the
   checks listed in the release note (normally: make a bill, open Udhaar, open `/admin`; 3
   minutes).
3. Back in GitHub: **Review deployments**, tick **production**, **Approve and deploy**.
4. Wait for the green tick (about 2 to 5 minutes). If it is red: do nothing else and send the
   link to Abdul. Production is untouched, because the app is only released after the database
   step succeeded.
5. Open `https://app.nexper.in/admin`, Platform tab: "Database: up to date (0NN)". Done.

**Cost.** About one and a half days of code (T01, T03) and one hour of Maqbool's time once.

### 3.6 Environments, variables and secrets

**Decision.**

| Environment | App | Database | Data | Deployed by |
| --- | --- | --- | --- | --- |
| dev | `next dev`, mocked backend; DB tests on PGlite | PGlite in memory | synthetic | the developer |
| staging | Vercel Preview of branch `main`, domain `staging.nexper.in` | Supabase project `nexper-staging` (Mumbai, Pro org, Micro) | synthetic only, seeded by `scripts/seed-staging.mjs`; **never a copy of production** | merge to `main` (automatic) |
| production | Vercel Production = branch `production`, `app.nexper.in` | `nexper-prod` (Mumbai) | real | Maqbool's approval |
| silo-<name> | own Vercel project, branch `production` | own Supabase project | that client's | same approval (matrix) |

Variables (Vercel; per environment): existing `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`CRON_SECRET`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, support
contacts, `NEXT_PUBLIC_GOOGLE_SIGNIN`; new `NEXT_PUBLIC_NEXPER_ENV`
(`staging`/`production`/`silo`; staging shows a "STAGING" ribbon), `HEALTH_TOKEN`,
`ADMIN_MFA_REQUIRED` (default `true`; `false` allowed only in staging).

GitHub environment secrets: `DATABASE_URL` (session pooler, per environment);
`BACKUP_S3_BUCKET`, `BACKUP_S3_KEY_ID`, `BACKUP_S3_SECRET` (production only). The backup
encryption **public** key (age) is committed in `ops/backup.pub`; the private key is held offline
by Maqbool (and a second copy with Abdul), never in GitHub.

**Rejected.** Sharing one Supabase project between staging and production with a schema per
environment (Auth is per project; a staging bug could touch real users). A Free-plan staging
project (pauses after a week idle, may run a different Postgres version; parity matters more
than about USD 10 a month).

**Cost.** Part of T03/T04. About USD 10/month for staging (estimate).

### 3.7 Rate limiting, quotas, noisy neighbours, timeouts, pooling

**Decision.**
- **Rate limits in Postgres**: unlogged table `rate_limit_hits(key, window_start, count)` and
  `rate_hit(key, window_seconds, max) returns boolean`, service role only. `lib/rateLimit.js`
  gets `async limit(key, opts)` using it, falling back to the in-memory counter if the call
  fails. All 12 current callers move over. Staff PIN sign-in gets a second limit **per staff
  code** (5 failures per 15 minutes), not only per IP (F10).
- **Quotas** (business limits, enforced where the action happens): shops per company
  (trigger, exists), staff per shop (staff create API), AI scans per company per month
  (aiGuard), API requests per key per minute (shopApi). **No storage quota**: we watch it
  (admin usage, 3.10) and talk to a shop that passes 1 GB.
- **Noisy neighbours:** the browser talks to PostgREST directly, so per-tenant throttling of
  ordinary reads is not possible without a proxy. We rely on: the 1,000-row API cap (keep),
  windows and `fetchAll` (existing rule), summaries instead of history scans
  (`shop_day_stats`), and Supabase's role timeouts. Expensive server routes (exports, report
  email, support views) are rate limited.
- **Statement timeouts:** keep Supabase defaults (believed: `anon` 3 s, `authenticated` 8 s;
  verify with `select rolname, rolconfig from pg_roles where rolname in
  ('anon','authenticated','authenticator','service_role');` as part of T04). Jobs that could
  run long are batched instead of raising timeouts.
- **Connection pooling:** the app uses supabase-js over HTTP (PostgREST has its own pool).
  Rule: never open a direct Postgres connection from a Vercel function; if one is ever needed,
  use the transaction pooler (port 6543). The migration runner and backup jobs use the session
  pooler from GitHub Actions.

**Rejected.** Upstash/Vercel KV now: one more vendor, a new place that sees user and shop ids,
and our rate-limited endpoints are low volume (sign-in, scans, emails, keys). Revisit when a
limiter call adds measurable latency or we need edge blocking (then Vercel Firewall rules first).

**Cost.** Half a day (T13).

### 3.8 Scale triggers, partitioning, archiving, summary tables

**Decision.** Build `shop_day_stats` now (T15). Everything else waits for a measured trigger.

Growth estimate (assumption: an average active shop makes 60 bills a day of 4 lines, every
day; real shops vary from 10 to 400):
60 x 365 = 21,900 bills a year x 2.15 KB = **47 MB**; plus credits, expenses, returns, stats,
dead rows and WAL, call it **about 60 MB per shop per year** (estimate, plus or minus 2x).

| Shops | New data per year (estimate) |
| --- | --- |
| 100 | 6 GB |
| 1,000 | 60 GB |
| 10,000 | 600 GB |

| Signal (measured) | Threshold | Action |
| --- | --- | --- |
| One shop's `credits` rows | > 20,000 | add `customer_balances` (shop_id, phone, balance) kept by trigger; Udhaar and Home read it |
| One shop's bills, Cashbook load p95 | > 50,000 bills or > 2 s | Cashbook opening balance from `shop_day_stats` |
| `bills` table size | > 100 GB (about 75 M bills at 1.35 KB) or "newest 100 bills" p95 > 200 ms | yearly range partitions on `date` for `bills` and `movements` (see note) |
| `movements` rows | > 200 M | stop writing one movement per sale line (derive sale history from `bills.items`), or partition |
| Quarterly restore test time | > 4 h | partition, then move purged/closed data out faster; consider PITR-only DR |
| DB CPU in the evening peak hour | > 70% for a week | next compute size; after the 2XL size, a read replica for admin/report reads |
| Nightly job duration | > 50% of `maxDuration` | more, smaller batches |
| Active shops | each doubling past 1,000 | load test on staging at 10x current peak first |

Partitioning note (for when it is triggered, not now): Postgres needs the partition key in
every unique constraint, so `bills (shop_id, bill_no)` would become unique per financial year
(add `fy` column). That matches GST practice (a serial per financial year) but changes bill
numbering; it is a product decision at that time.

**Rejected.** Partitioning now (adds key and constraint changes for tables that are small
today). Hash partitioning by `shop_id` (helps nothing that the `(shop_id, date)` indexes do not
already do, and makes archiving by year impossible).

**Cost.** `shop_day_stats` one day (T15). The rest: zero until triggered.

### 3.9 Data lifecycle and DPDP

Roles (to be confirmed by a lawyer, open question 5): for **shop owners and staff**, Nexper is
the data fiduciary. For **a shop's customers** (names and phones in bills and udhaar), the
**shop is the fiduciary and Nexper its processor**: we act on the shop's instructions and give
the shop tools to answer its customers.

**Decision.**

| Data | Kept | Then |
| --- | --- | --- |
| Shop data of an active shop | as long as the shop is active (it is their books) | owner decides |
| Closed shop (owner closed it, or account deletion) | 90 days, read-only, exportable, can be reopened | purged by the nightly job |
| Free shop with no sign-in for 12 months | 2 emails (30 and 7 days before), then closed | as above |
| Trash (`deleted_rows`) | 30 days | purged |
| `client_errors`, `rate_limit_hits` | 30 days / 1 day | purged |
| `admin_audit_log`, `support_sessions`, `support_access_log` | 2 years, even after the shop is purged | purged |
| Supabase backups / offsite dumps | 7 days / 8 weeks | rotate (a purged shop can live in a backup that long; say so in the privacy policy) |

- **GST/tax records**: the duty to keep accounts for 72 months (CGST Act s.36, as I
  understand it) is the **shopkeeper's**. Nexper does not promise a 6-year archive. On closure
  the owner is told plainly to download the backup and keep it 6 years.
- **DPDP rights:**

| Right | How |
| --- | --- |
| Access / summary | Owner: Store settings backup (zip with `data.json`) and a "My account data" panel (email, shops, roles, support sessions). |
| Correction | Existing edit screens. |
| Erasure (owner) | "Close my account" closes the company and its shops; purge after 90 days; then the auth user is deleted. |
| Erasure (a shop's customer, asked of the shop) | Later task: owner action "Remove customer's details" anonymises name and phone in bills, udhaar, returns and reminders, keeping amounts; allowed only when the balance is zero. Built before the DPDP duties apply (the Rules notified in Nov 2025 phase most duties in about 18 months; verify dates). |
| Portability | The zip with `data.json`. |
| Grievance | A named grievance contact in the privacy policy (content task on `nexper-site`). |
| Breach | Runbook: who decides, notifying the Board and affected owners; logs kept long enough to investigate. |

**Rejected.** Keeping closed shops forever (cost, and DPDP wants deletion once the purpose is
over). Deleting immediately (F4).

**Cost.** Closure one day (T07); customer anonymisation half a day later; text changes on the
website by the product owner.

### 3.10 Observability (tenant-aware)

**Decision.**
- **Errors:** browser errors are posted to `/api/log-error` (rate limited per IP) and stored in
  `client_errors` (shop id, user id, route, message up to 500 chars with any run of 6+ digits
  replaced by `#`, short stack, app version, user agent). Server errors already go to Vercel
  logs through `serverError`; add the shop id to the log line where known. Console tab "Errors".
- **Usage per tenant:** `admin_usage(month)` (service role) returns, per company: shops,
  active shops, bills (from `shop_day_stats`), AI scans, active API keys, and an estimated
  storage figure (bills x 1.35 KB + movements x 0.2 KB, labelled as an estimate). Shown in the
  console; this is the basis for pricing and for spotting a heavy tenant.
- **Audit:** `admin_audit_log` (every admin write, exists), `support_sessions` +
  `support_access_log` (every admin read). Owner sees support sessions.
- **Health:** `/api/health` (token) returns app commit, `db_version()` and the version the code
  expects.

**Rejected.** Sentry or another hosted tracker: page state and URLs would leave our systems
(conflicts with the "no shop data to third parties" rule). Revisit only with strict scrubbing and
a privacy-policy change. Per-request usage metering: not needed for a flat-price product.

**Cost.** Half a day (T13 for errors) + half a day (T17 usage).

### 3.11 Identity

**Decision.**
- One auth user is one person. They **own at most one company** (unique index exists; keep it:
  a person with two unrelated businesses uses one company with two shops, or two logins). They
  can be a member of any number of shops in any number of companies.
- **Staff (code + PIN) belong to exactly one shop and never to a company team**: 
  `org_set_member` refuses internal staff accounts (F7).
- The active shop decides the company context: `orgInfo` is loaded for `activeShop.org_id`,
  not "the first organisation" (F3). The shop switcher groups shops by company.
- Passkeys: unchanged (per user, per hostname). Platform admins: **MFA required**; recommend
  separate admin accounts from personal shop accounts.

**Rejected.** Allowing several owned companies per user (billing and the switcher get
confusing; no customer asked). Staff in several shops (they would need a shop picker at PIN
sign-in; chains use company roles instead).

**Cost.** Half a day (T12).

### 3.12 Backup and disaster recovery

**Decision.**

| Stage | When | What | RPO | RTO (target) |
| --- | --- | --- | --- | --- |
| A | now, before the first paying shop | Supabase **Pro** (daily backups, 7 days), weekly encrypted `pg_dump` to S3 Mumbai (8 weeks), quarterly restore test | 24 h (7 days if the Supabase account itself is lost) | whole DB 4 h; one shop 1 working day |
| B | when monthly revenue is at least 5x the PITR cost (about Rs 45,000/month, about 450 shops at Rs 99; estimate) **or** a chain/enterprise contract needs it | add **PITR (7 days)** on at least the Small compute size | minutes (Supabase's claim; verify) | same |

- Region: verify the project is **Mumbai (ap-south-1)** now (Maqbool step). If it is not,
  moving it is task T04's emergency branch: new project in Mumbai, dump and restore including
  `auth`, switch keys, while there is little data.
- Why an offsite copy: deleting a Supabase project deletes its backups; an account lock-out or
  billing failure takes both. The weekly dump is encrypted with an age public key before upload;
  only the offline private key can read it.
- Restore test (quarterly, Maqbool with the runbook): restore the latest backup into a scratch
  project (or into staging after wiping it, if "restore to a new project" is not available on our
  plan; verify), run `ops/verify-restore.sql` (row counts per table, newest bill date), time it,
  write the result in `docs/RUNBOOK_RESTORE.md`, delete the scratch project.
- When the dump exceeds about 50 GB (estimate: around 800 shops), switch the offsite copy to
  monthly; at that point stage B should already be in place.

**Rejected.** PITR now (cost vs revenue, above). Offsite copy in GitHub artifacts (size and
retention limits). Dumping to a non-Indian region (keep data in India).

**Cost.** Supabase Pro about USD 25/month; S3 under USD 1/month at first; half a day (T05).

### 3.13 Offline / PWA effects on the data model

**Decision.**
- `save_bill(p_bill jsonb)` does stock deduction, the bill row and the udhaar charge in **one
  transaction**, keyed by the client-generated `bills.id` (already a UUID made on the device).
  Calling it again with the same id returns the saved bill and changes nothing. The udhaar row
  also gets a client id. Billing permission is enough for the udhaar charge of that bill
  (today a billing-only helper's udhaar bill fails half-way).
- Bill number: the device still proposes `KS-n` (so offline bills print immediately). If that
  number is taken, the function saves it as `KS-n-2` (next free suffix) and returns the final
  number; the app updates the shown bill.
- The offline queue sends one `save_bill` call per bill; the "23505 means bill-number clash"
  hack is removed for it. If the database does not have 042 yet, the app uses the old path.
- Ordering: queued bills replay in the order made; each carries its own `date` (time on the
  device), so reports are correct even when synced later. Stock may go briefly negative-capped
  as today (`greatest(0, ...)`); unchanged.

**Rejected.** A sync engine / CRDT (far beyond need). Server-only bill numbers (offline printing
would break).

**Cost.** One day (T14).

### 3.14 Security invariants and tests

See section 5. Effort is inside each task; the checklist test itself is T02.

### 3.15 Cost per tenant

See section 9.

---

## 4. Data model changes

All new tables: `shop_id` (where shop data) with `references shops(id) on delete cascade`,
RLS on, an index leading with `shop_id`, an entry in `tests/db/isolation.rls.mjs` and in the
table classification (`tests/db/tables.mjs`, T02). Every new `security definer` function:
`set search_path = public`, checks the caller inside, `revoke all ... from public, anon`, and
explicit grants. Every migration ends with `select record_migration(...)`.

### 036_migration_tracking.sql (T01)
- Table `app_migrations(version text primary key, name text not null, checksum text,
  applied_at timestamptz not null default now(), applied_by text not null default 'sql-editor')`.
  RLS on, no policies.
- `record_migration(p_version text, p_name text)`: inserts, `on conflict do nothing`. Granted to
  nobody but the owner role (it runs inside migrations).
- `db_version() returns text`: `max(version)`; security definer; granted to `authenticated`,
  `service_role` (used by the app's "needs the latest database update" check).
- Backfill: if `organisations` exists (035 was run), insert `001`...`035` (each file name) with
  `applied_by = 'history'`; otherwise `raise exception 'Run updates 001-035 first'`.

### 037_shop_closure.sql (T07)
- `shops`: `status text not null default 'active' check (status in ('active','closed'))`,
  `closed_at timestamptz`, `closed_by uuid`, `close_reason text`, `purge_after timestamptz`.
- `close_shop(p_shop uuid, p_reason text)`: owner of the shop (or company owner) only; sets
  closed, `purge_after = now() + 90 days`, deletes staff and `via_org` memberships of that shop
  (the owner keeps access for export/reopen), revokes its API keys.
- `reopen_shop(p_shop uuid)`: owner, only while `purge_after > now()`; respects `max_shops`.
- `purge_closed_shops(p_limit int)`: service role; hard-deletes up to N shops past
  `purge_after` (cascade), writes one `admin_audit_log` row each.
- Drop policy "Owners can delete their shops". Shops are deleted only by the purge function.
- Shop limit trigger counts only `status = 'active'` shops.

### 038_support_access.sql (T08)
- `support_sessions(id uuid pk, admin_id uuid not null, admin_email text, org_id uuid not null,
  shop_id uuid, ticket_ref text not null check (char_length between 3 and 40), reason text not
  null check (char_length between 10 and 300), kind text not null check in
  ('support','break_glass'), unmask_phones boolean not null default false, started_at
  timestamptz default now(), expires_at timestamptz not null, ended_at timestamptz, check
  (expires_at <= started_at + interval '2 hours'))`. **No foreign keys to shops/orgs on
  purpose** (the record must outlive a purged shop; allow-listed in the checklist test).
  Index `(org_id, started_at desc)`.
  RLS select: `is_org_owner(org_id) or (shop_id is not null and is_shop_owner(shop_id))`.
  No write policies.
- `support_access_log(id bigint generated always as identity pk, session_id uuid not null,
  admin_id uuid not null, shop_id uuid, resource text not null, params jsonb, row_count int,
  at timestamptz default now())`. Index `(session_id)`, `(shop_id, at desc)`. RLS on, no
  policies (owners see counts through a definer function `support_session_summary(p_org)`).
- Append-only: trigger on both tables and on `admin_audit_log` raising on update/delete unless
  `current_setting('nexper.purging', true) = 'on'`; `revoke update, delete on ... from
  anon, authenticated, service_role`.
- `purge_old_audit()`: service role; deletes rows older than 2 years in the three tables.

### 039_company_plans.sql (T10)
- `org_controls(org_id uuid primary key references organisations(id) on delete cascade, plan
  text check (plan in ('free','pro')), plan_expires_at timestamptz, limits jsonb not null
  default '{}', feature_overrides jsonb not null default '{}', billing_name text,
  billing_gstin text, billing_email text, deployment text not null default 'shared', notes text,
  updated_at timestamptz default now(), updated_by uuid)`. RLS select `is_org_member(org_id)`;
  no writes. Backfill: one row per company with `plan` null.
- `ai_usage.org_id uuid` filled by a before-insert trigger from `shops.org_id`; backfill; index
  `(org_id, created_at desc)`.

### 040_identity_guards.sql (T12)
- `org_set_member`: refuse when the email ends with `@workers.nexper.internal` or the user holds
  any `shop_members` row with a `staff_code`.

### 041_ops_tables.sql (T13)
- `rate_limit_hits(key text, window_start timestamptz, count int not null, primary key (key,
  window_start))` **unlogged**; RLS on, no policies. `rate_hit(p_key text, p_window_seconds int,
  p_max int) returns boolean` (service role only). `purge_ops()` (service role) deletes windows
  older than 1 day and `client_errors` older than 30 days.
- `client_errors(id bigint identity pk, at timestamptz default now(), shop_id uuid references
  shops(id) on delete cascade, user_id uuid, route text, message text, stack text, app_version
  text, user_agent text)`. Index `(shop_id, at desc)`, `(at desc)`. RLS on, no policies.

### 042_save_bill.sql (T14)
- Move the body of `sell_items` into an internal `_deduct_stock(p_shop uuid, p_lines jsonb)`
  (not granted to anyone); `sell_items` becomes a wrapper (old app versions keep working).
- `save_bill(p_bill jsonb) returns jsonb` (`{id, bill_no, created}`): needs
  `has_shop_permission(shop, 'billing')`; `pg_advisory_xact_lock(hashtext(id))`; if a bill with
  that id exists in that shop return it with `created = false`; if it exists in another shop
  raise; else deduct stock, insert the bill (next free `-n` suffix on a bill-number clash), and
  for `payment_type = 'credit'` insert the credit charge with `p_bill->>'credit_id'` as its id
  (`on conflict do nothing`).

### 043_shop_day_stats.sql (T15)
- `shop_day_stats(shop_id uuid references shops on delete cascade, day date, bills int,
  sales numeric(14,2), cash numeric, upi numeric, card numeric, bank numeric, udhaar_sales
  numeric, discount numeric, gst numeric, cost numeric, returns int, returns_amount numeric,
  udhaar_received numeric, expenses numeric, updated_at timestamptz, primary key (shop_id,
  day))`. `day` = the IST date (`(date at time zone 'Asia/Kolkata')::date`). GST per line =
  `qty*price*gst/(100+gst)` (same as `lib/gstReport.js`); cost = `qty*cost_price` where known.
- Triggers (after insert) on `bills`, `sale_returns`, `credits` (type payment), `expenses`
  (insert and delete) add into the day row. `refresh_shop_day_stats(p_shop uuid, p_from date,
  p_to date)` recomputes from source (service role; the nightly job runs it for yesterday and
  today for every shop with activity).
- RLS select: `has_shop_permission(shop_id,'dashboard') or has_shop_permission(shop_id,
  'reports')`. No writes. Company roles read it through their `via_org` memberships.
- Backfill from all history in the migration (one grouped insert; on a database over about 1 M
  bills mark the file `-- nexper:no-transaction` and batch per shop).
- `shops.summary_sent_on date` for the batched nightly summary.

### 044_deleted_rows.sql (T16)
- `deleted_rows(id bigint identity pk, shop_id uuid, owner_id uuid, table_name text not null,
  row_id text not null, row jsonb not null, deleted_by uuid default auth.uid(), deleted_at
  timestamptz default now())`. Index `(shop_id, deleted_at desc)`. No FK (survives the row's
  parent; allow-listed). RLS on, no policies (support restores).
- `after delete for each row` trigger `keep_deleted_row()` on: `shop_products`, `products`,
  `suppliers`, `shop_suppliers`, `fixed_expenses`, `clearance_offers`, `offer_posts`,
  `purchase_orders`, `supply_points`, `supply_payments`, `shop_members`. It does nothing when
  `nexper.purging = 'on'` (shop purge).
- `restore_deleted_row(p_id bigint)` (service role): `insert into <table> select * from
  jsonb_populate_record(null::<table>, row)` with the table name checked against the list above.
- `purge_closed_shops` and `purge_ops` also delete trash older than 30 days.

### 045_admin_usage.sql (T17)
- `admin_usage(p_month date)` (service role only) as described in 3.10.

### Later, by trigger (numbers assigned when built)
- `anonymise_customer(p_shop, p_phone)` (owner only, zero balance only).
- `customer_balances`, bills/movements partitioning (3.8).

---

## 5. Security invariants and the tests that prove them

| # | Invariant | Test |
| --- | --- | --- |
| S1 | Another shop, an anonymous visitor and a helper without the permission cannot read, change, delete or insert any shop's rows, in every table. | `tests/db/isolation.rls.mjs` (exists); every new table added. |
| S2 | No table ships without RLS and an isolation entry. | isolation test step 0 (exists). |
| S3 | Every `shop_id` column has a foreign key to `shops(id)` with `on delete cascade`, except an explicit allow-list with a reason (audit, trash, invites). | `tests/db/catalog.mjs` (T02). |
| S4 | Every table with `shop_id` has an index whose first column is `shop_id`. | catalog test. |
| S5 | Every `security definer` function in `public` sets `search_path`; `anon` and `PUBLIC` cannot execute it unless on a named allow-list. | catalog test. |
| S6 | Every table is classified (shop / owner / org / platform / public-read) with its lifecycle (purged with shop, with account, after N days, kept 2 years). | catalog test against `tests/db/tables.mjs`. |
| S7 | Audit tables are append-only for every API role, including the service role. | catalog test (`has_table_privilege`) + a trigger test. |
| S8 | A migration from 036 on records itself, matches its file name, and does not drop anything without `-- nexper:contract`. | catalog test reads the files. |
| S9 | An applied migration is never edited. | runner checksum check in CI against staging and production. |
| S10 | Support reads happen only inside an open, unexpired session of the calling admin, for the session's shop/company, and every read is logged before data is returned; a failed log write returns no data. | `tests/support.test.mjs` (route logic with a fake client) + `tests/db/support.rls.mjs`. |
| S11 | Owners see their own support sessions and nobody else's. | `tests/db/support.rls.mjs`. |
| S12 | Admin API routes refuse a token without `aal2` when MFA is required. | `tests/console.test.mjs`. |
| S13 | `save_bill` is idempotent, all-or-nothing, and refuses other shops and anonymous callers. | `tests/db/save_bill.rls.mjs`. |
| S14 | A closed shop can be read by its owner only, cannot be reached by staff or company roles, and is purged only by the service role after its date. | `tests/db/closure.rls.mjs`. |
| S15 | `shop_day_stats` equals a recomputation from source data, and only permitted members read it. | `tests/db/stats.rls.mjs`. |
| S16 | Export then import of a shop into an empty database reproduces it (same ids and counts), and never touches another shop. | `tests/db/shop_roundtrip.mjs`. |
| S17 | Plan/feature/limit evaluation follows the documented order. | `tests/console.test.mjs` cases. |
| S18 | Company members (`via_org`) never gain rights staff policies deny; staff accounts cannot join a company team. | `tests/db/orgs.rls.mjs` (extend). |
| S19 | The code never imports `supabaseAdmin` in a client component and never hard-codes a Supabase URL or key. | small grep test in `tests/unit.test.mjs`. |

All of these run on every push (`npm test`, `npm run test:db`).

---

## 6. Rollout plan

Each task is sized for one Sonnet session (half a day or less). Do them in order; a task
lists what it depends on. "Maqbool" marks a dashboard step he must do (with Claude in Chrome,
from a checklist the task writes). Every code task ends with: `npm test`, `npm run test:db`,
`npm run check:i18n`, `npx next build` green; changed screens checked in Night and Light at
390 px; new texts in all five `i18n` files; `SECURITY.md` / `docs/ARCHITECTURE.md` updated
where the task changes what they say; update the pending list in `PROJECT_ABDUL.md`.

**T01. Migration runner and tracking (036).** Code only.
- Goal: one function applies migrations, used by tests and by production.
- Files: new `tools/migrate-core.mjs` (`applyMigrations(client, {dir, strictFrom: '036',
  dryRun})`), `tools/migrate.mjs` (CLI: `DATABASE_URL=... node tools/migrate.mjs [--dry-run]`,
  uses `pg`), `tests/db/setup.mjs` (use the core), `supabase/migrations/036_migration_tracking.sql`,
  `package.json` (`pg` dev dependency, `db:migrate` script), `lib/dbVersion.js` + a
  `useDbVersion()` helper.
- Acceptance: PGlite build from empty records 001-036; running twice applies nothing; a
  changed applied file fails; a failing 036+ file rolls back and stops; an existing database
  with 035 (simulate with `buildDb({upTo:'035'})`) gets only 036 and the history backfill; a
  database without 035 is refused with the plain message; gaps (032) and `012b` handled.
- Depends on: nothing.

**T02. New-table checklist test.** Code only.
- Goal: S3-S8 enforced automatically.
- Files: `tests/db/tables.mjs` (classification of all current tables), `tests/db/catalog.mjs`,
  `package.json` `test:db`, `CLAUDE.md` (the checklist rule points here).
- Acceptance: passes on the current schema (fix or allow-list, with reasons, anything it
  finds, e.g. `tenant_invites.shop_id ... on delete set null`); adding a dummy table without a
  `shop_id` index or classification makes it fail (prove in the PR description).
- Depends on: T01.

**T03. Release pipeline and staging.** Code + **Maqbool (one time)**.
- Goal: staging migrates on merge; production migrates after approval, then the app is
  released.
- Files: `.github/workflows/release.yml` (job `staging`: `node tools/migrate.mjs` with the
  staging secret on push to `main`; job `production`: `environment: production` (required
  reviewer), runs the migration with `--dry-run` printed first, then for real, then
  `ops/verify.sql`, then fast-forwards branch `production` to the released commit; later
  silo environments join a matrix), `.github/workflows/drift.yml` (weekly, read-only:
  compares `app_migrations` and a catalog snapshot of staging and production, opens an issue on
  difference), `scripts/seed-staging.mjs`, `docs/RELEASE.md` (the 5 steps of 3.5),
  `MAQBOOL_TASKS.md` (one-time list below).
- Maqbool, once: create Supabase project `nexper-staging` in Mumbai; create GitHub
  environments `staging` and `production` with `DATABASE_URL` (session pooler string) and
  himself as required reviewer on `production`; create branch `production` from `main`; in
  Vercel set Production Branch = `production`, Preview env vars = staging keys, domain
  `staging.nexper.in` → branch `main`; run the seed once (Actions → "Seed staging").
- Acceptance: a test migration `0NN_noop` (not merged) shows the full path on a fork or with a
  dry run; documented screenshots in `docs/RELEASE.md`; a red migration leaves `production`
  branch where it was.
- Depends on: T01.

**T04. Environment hardening.** Code + **Maqbool**.
- Goal: Mumbai everywhere, versions visible, staging clearly marked.
- Files: `vercel.json` (`"regions": ["bom1"]`), `app/api/health/route.js` (token), admin
  Platform tab "Database version" card (reads `db_version()`; shows "up to date" or "needs
  update 0NN"), staging ribbon from `NEXT_PUBLIC_NEXPER_ENV`, `MAQBOOL_TASKS.md`.
- Maqbool: confirm region is ap-south-1 (if not, stop and tell Abdul: a move project follows);
  upgrade Supabase to **Pro**; upgrade Vercel to **Pro** (Hobby is for non-commercial use; verify
  their terms); turn on MFA for his Supabase, Vercel and GitHub accounts; run the timeout query
  in 3.7 and report the result; Auth settings already listed in SECURITY.md "Still open".
- Acceptance: build passes; health returns 401 without token, versions with it; ribbon shows
  only when the env var says staging.
- Depends on: T01, T03.

**T05. Offsite backup and restore runbook.** Code + **Maqbool**.
- Goal: a copy outside Supabase; a tested way back.
- Files: `.github/workflows/backup.yml` (weekly; `pg_dump --format=custom` with a Postgres
  client matching the server version, `age -R ops/backup.pub`, upload to S3 with an 8-week
  lifecycle; uses `production` environment secrets but no approval), `ops/backup.pub`,
  `ops/verify-restore.sql`, `docs/RUNBOOK_RESTORE.md` (whole-database restore, one-shop restore
  (uses T06 tools), quarterly test log table, who holds the private key).
- Maqbool: create an S3 bucket in ap-south-1 with versioning and an access key limited to
  `PutObject` on it; add secrets; create the age key pair on his own computer with the runbook's
  commands, keep the private key in two offline places; do the first restore test with the
  runbook and fill in the log.
- Acceptance: workflow succeeds against staging first; the runbook's restore steps were
  actually followed once on staging (record the time).
- Depends on: T03, T04.

**T06. Shop export/import and owner `data.json`.** Code only.
- Goal: full-fidelity, per-shop copy used for restore, portability and silo moves.
- Files: `tools/shop-export.mjs`, `tools/shop-import.mjs` (`--mode missing-only|replace`,
  `--dry-run`; table order from `tests/db/tables.mjs`; owner-level products/suppliers
  referenced by the shop included), `.github/workflows/restore-shop.yml` (manual, inputs: source
  DB secret name, shop id, mode; `production` approval), `lib/exportData.js` (add `data.json`
  with raw rows), `tests/db/shop_roundtrip.mjs`.
- Acceptance: S16; `replace` on a shop never changes rows of another shop (test with two
  shops); owner zip still opens in Excel and now contains `data.json`.
- Depends on: T02.

**T07. Close instead of delete (037).** Code only.
- Goal: no one-click total loss (F4).
- Files: `supabase/migrations/037_shop_closure.sql`, `components/ShopContext.js`
  (`closeActiveShop`, `reopenShop`; closed shops listed separately), Store settings ("Close
  shop" with typed confirmation and the GST warning, "Download backup", "Reopen" while in the 90
  days), `app/(app)/layout.js` (a closed active shop shows only the closed-shop screen),
  `app/api/admin/delete-shop/route.js` → close with reason; admin "Purge now" only for shops
  with no bills (test/spam) with typed shop name; `app/api/cron/purge/route.js` (daily, calls
  `purge_closed_shops(50)` and `purge_ops()`), `vercel.json`, `tests/db/closure.rls.mjs`, i18n.
- Acceptance: S14; old app version calling `delete` on shops gets a refusal (no policy);
  `max_shops` ignores closed shops.
- Depends on: T01, T02.

**T08. Support sessions backend (038).** Code only.
- Goal: S10, S11, F9.
- Files: `supabase/migrations/038_support_access.sql`, `lib/supportView.js` (resource
  allow-list, each an explicit scoped query, phone masking unless `unmask_phones`),
  `app/api/admin/support/start|view|end/route.js` (requireAdmin, rate limited, audit),
  `tests/support.test.mjs`, `tests/db/support.rls.mjs`, `tests/db/isolation.rls.mjs` entries.
- Acceptance: view without a session, with another admin's session, after expiry, or for
  another shop → 403 and no log row of data; log insert failure → 500 with no data; owner of
  shop A cannot see shop B's sessions.
- Depends on: T02.

**T09. Support UI, admin MFA, overview minimisation.** Code + **Maqbool** (enrol MFA).
- Goal: admins can work only through sessions; owners can see them.
- Files: admin console "Support" tab (start a session: shop, ticket, reason, minutes, kind;
  viewer for the allow-listed resources; end), `app/admin/login/page.js` (TOTP enrol and
  verify with `supabase.auth.mfa`), `lib/supabaseAdmin.js` (`requireAdmin` checks `aal2` unless
  `ADMIN_MFA_REQUIRED=false`), `/api/admin/overview` (drop `staff_code`), Store settings
  "Nexper support access" list (owner; reads `support_sessions` via RLS +
  `support_session_summary`), i18n for the owner screen (admin stays English), `SECURITY.md`
  (support policy and the SQL-editor break-glass rule).
- Maqbool: enrol the authenticator app on each admin account at first sign-in.
- Acceptance: S12; owner screen in both themes at 390 px; admin without MFA sees the enrol
  screen, not the console.
- Depends on: T08.

**T10. Company plans backend (039).** Code only.
- Goal: plan, expiry, limits, overrides per company with the order in 3.1.
- Files: `supabase/migrations/039_company_plans.sql`, `lib/platformConfig.js` (`planOf`,
  `evalFeature`, `evalLimit` take a view `{...shop, controls, orgControls}`),
  `lib/platformDefaults.js` (`normalizeOrgControls`), `lib/tenantView.js` (server:
  `loadTenantView(admin, shopId)`), `components/ShopContext.js` (load `org_controls` for the
  active shop's company), `tests/console.test.mjs` (S17: every step of the order, expiry at
  both levels), isolation entry for `org_controls`.
- Acceptance: with no company plans set, every existing test and screen behaves exactly as
  before.
- Depends on: T02.

**T11. Company plans in the console, pooled AI quota.** Code only.
- Goal: admins manage companies, not shops; quota per company (F2).
- Files: `app/api/admin/org-controls/route.js` (GET list of companies with shops; POST
  validated, audited), console Tenants tab grouped by company (company row: plan, expiry,
  limits, overrides, max shops, billing fields, deployment; shop rows: "support override"
  fields as today), `lib/aiGuard.js` (shop id from the request body, checked against
  membership; count `ai_usage` by `org_id` unless a shop override sets the limit), the two scan
  routes and their callers (send `shopId`), `lib/shopApi.js` (use `loadTenantView`).
- Acceptance: a chain's scans count against the company; a user in two companies is charged
  to the shop they scanned from; tests for both.
- Depends on: T10.

**T12. Identity guards (040) and company context.** Code only.
- Goal: F3, F7.
- Files: `supabase/migrations/040_identity_guards.sql`, `components/ShopContext.js` (`orgInfo`
  from `activeShop.org_id`), side-menu shop switcher grouped by company, `tests/db/orgs.rls.mjs`
  (S18: staff account refused).
- Acceptance: a user who owns company A and manages company B sees B's Company screen when a
  B shop is active.
- Depends on: T10.

**T13. Shared rate limiter and client error log (041).** Code only.
- Goal: limits that hold across instances; F10; our own error tracking.
- Files: `supabase/migrations/041_ops_tables.sql`, `lib/rateLimit.js` (`async limit()` with
  in-memory fallback; keep `requestIp`), all 12 callers, `app/api/staff/login/route.js` (extra
  per-code failure limit), `app/api/log-error/route.js`, a small client reporter in the app
  layout (window `error` / `unhandledrejection`, scrubbing digits), admin "Errors" tab,
  isolation entries.
- Acceptance: two simulated instances share a limit (unit test with a fake rpc); the sixth
  wrong PIN for one code within 15 minutes is refused from a new IP.
- Depends on: T02.

**T14. Idempotent bill save (042).** Code only.
- Goal: F1.
- Files: `supabase/migrations/042_save_bill.sql`, `app/(app)/billing/useBilling.js` (one
  `runQueued({type:'rpc', fn:'save_bill', args:{p_bill}})`, `credit_id` generated on the
  device, final `bill_no` from the answer; old path when the function is missing),
  `lib/offlineQueue.js` (no bill-number hack for `save_bill`), `tests/db/save_bill.rls.mjs`
  (S13: same bill three times → one bill, stock down once, one credit; number clash →
  suffix; other shop and anon refused; billing-only helper can make an udhaar bill).
- Acceptance: also run `tests/db/scale.mjs` unchanged.
- Depends on: T02.

**T15. Daily stats (043) and batched nightly job.** Code only.
- Goal: summary table for chains/admin/summary; F5.
- Files: `supabase/migrations/043_shop_day_stats.sql`, `app/api/cron/notify/route.js` (takes
  up to 100 shops where `summary_sent_on` is not today (IST), builds the summary from
  `shop_day_stats`, marks them; runs `refresh_shop_day_stats` for shops with activity),
  `vercel.json` (every 10 minutes from 16:00 to 17:50 UTC = 21:30 to 23:20 IST),
  `lib/notify.js`, `tests/db/stats.rls.mjs` (S15, including a bill at 23:59 and 00:01 IST,
  returns netting), isolation entry.
- Acceptance: stats equal recomputation on random data; summary text unchanged for a small
  shop (compare with the old builder in a unit test).
- Depends on: T02. (Chain Home and Reports reading it are CHAINS.md phase 2, separate tasks.)

**T16. Trash for deleted rows (044).** Code only.
- Goal: restore accidental row deletes for 30 days.
- Files: `supabase/migrations/044_deleted_rows.sql`, support viewer resource "Recently
  deleted" and a "Restore" action (audited), purge in `purge_ops`, isolation entry, tests
  (delete then restore an item; purge of a closed shop leaves no trash rows).
- Depends on: T07, T09.

**T17. Usage per company (045).** Code only.
- Goal: see cost drivers per tenant.
- Files: `supabase/migrations/045_admin_usage.sql`, console "Usage" card (month picker, sortable
  by bills and estimated storage), test that only the service role can call it.
- Depends on: T15.

**T18. Account data and closing an account.** Code only.
- Goal: DPDP access/erasure for owners.
- Files: account menu "My account data" panel; "Close my account" (closes the company's shops
  via `close_shop`, schedules auth user deletion after the last purge; `app/api/account/close`),
  i18n, tests.
- Depends on: T07.

**T19. Silo readiness.** Code only.
- Goal: nothing assumes one deployment.
- Files: replace remaining hard-coded `app.nexper.in` in UI text with `NEXT_PUBLIC_APP_URL`
  (keep marketing links), S19 grep test, `docs/SILOS.md` (setup checklist: Supabase project,
  Vercel project, env vars, GitHub environment in the release matrix, moving a company with T06
  tools, invoicing note).
- Depends on: T03, T06.

**Later, when triggered (not scheduled):** customer anonymisation (before DPDP duties apply);
PITR purchase (Maqbool, stage B); `customer_balances`; partitioning; first silo.

Summary of who does what:

| Task | Needs Maqbool |
| --- | --- |
| T01, T02, T06, T07, T08, T10-T19 | no (code only) |
| T03 | one-time: staging project, GitHub environments, Vercel branch settings |
| T04 | region check, Supabase Pro, Vercel Pro, MFA on accounts, timeout query |
| T05 | S3 bucket, encryption keys, first restore test |
| T09 | enrol MFA for admin accounts |
| every release afterwards | the 5 steps in 3.5 |

---

## 7. What we deliberately do not build (and what would make us)

| Not building | Trigger to build |
| --- | --- |
| Table- or schema-per-shop | never for the standard plan (product decision) |
| Database per tenant for everyone | never; silo only per contract |
| Tenant routing of one deployment to many databases | more than about 5 silos, when per-silo deployments become the bigger cost |
| Supabase CLI migrations | starting a brand-new project from a squashed baseline |
| PITR | revenue 5x its cost or a contract (3.12) |
| Nightly per-shop snapshots | a contract that requires per-tenant backups |
| Owner self-service restore UI | more than a few restore requests a month |
| Redis / Upstash limiter | a limiter call adds measurable latency, or edge attacks Vercel Firewall cannot stop |
| Third-party error tracking / APM | an incident we could not diagnose from our own logs, plus a scrubbing design and policy change |
| Partitioning, archiving, read replicas | thresholds in 3.8 |
| `customer_balances` | a shop with more than 20,000 udhaar entries |
| Owner approval before support access | an enterprise contract asks for it (then a per-company switch) |
| Per-tenant encryption keys | a contract; usually solved by a silo instead |
| Staff in several shops / several owned companies per user | a paying customer who needs it |
| A real sync engine for offline | conflicts that `save_bill` idempotency does not solve |
| Paid 6-year archive for closed shops | demand from owners |
| Server-assigned bill prices in `save_bill` | a fraud case or an enterprise requirement (prices still come from the device, as today) |

---

## 8. Risks and questions only the product owner can answer

| # | Question | My recommended answer |
| --- | --- | --- |
| 1 | Until revenue pays for PITR, a disaster can lose up to 24 hours of bills. Acceptable? | Yes, with the weekly offsite copy, closure and trash in place; buy PITR at about 450 paying shops or the first chain contract. |
| 2 | Support access: owner is told after the fact (visible list), or must approve first? | Told after; approval only as an enterprise option. Shopkeepers ask for help on WhatsApp and expect us to just look. |
| 3 | Closed shops kept 90 days then deleted; owners keep their own export for GST. OK? | Yes. |
| 4 | Free shops with no sign-in for 12 months are closed after two emails. OK? | Yes. |
| 5 | Terms and privacy policy must say Nexper is the processor for shops' customer data, name a grievance contact, and cover backups and support access. Who reviews with a lawyer, and by when? | Before 100 paying shops, and before the DPDP duties apply. |
| 6 | Price floor for an enterprise silo? | At least Rs 25,000/month plus a setup fee (infra about USD 10-135/month plus our time). |
| 7 | The default Pro plan allows 500 AI scans a month at Rs 99. At about USD 0.006 a scan on the current model (estimate: about 2,200 input tokens at USD 1/M and 800 output tokens at USD 5/M, Haiku 4.5 list price), 500 scans cost about USD 3 (about Rs 255), more than the subscription. | Lower the Pro default to 150, or test the cheaper current Haiku model (list price about a tenth) for scan quality before deciding. |
| 8 | A helper with only billing permission will be able to save an udhaar bill (today it fails half-way). OK? | Yes; the charge is tied to the bill. |

Things I could not verify (each has a task step that checks it): the Supabase plan, region and
Postgres version; Supabase role timeouts; whether "restore to a new project" and PITR are
available on the current plan; Vercel plan and default function region; whether production has
drifted from the repo (for example objects created from old in-app SQL snippets; the drift job
in T03 will show it); current Supabase/Vercel/AWS prices; exact DPDP Rules dates and duties.

---

## 9. Cost and scale

All figures are **estimates** from list prices as I know them (verify on supabase.com/pricing,
vercel.com/pricing and AWS) at about Rs 85 per USD. Supabase list prices assumed: Pro USD 25
including USD 10 of compute (covers Micro), 8 GB disk then USD 0.125/GB-month, 250 GB egress,
100,000 monthly active users; compute Small USD 15, Medium 60, Large 110, XL 210, 2XL 410; PITR
7 days USD 100, 14 days USD 200. Usage assumptions: 60 MB of data per shop-year (3.8); 2.5
sign-in users per shop; about 400 API requests per shop per day, 15% of them in the evening
peak hour; 30% of shops use 50 AI scans a month at USD 0.006 each.

Arithmetic for load: 1,000 shops x 400 = 400,000 requests/day; peak hour 60,000 = about 17
requests/second. 10,000 shops: about 170 requests/second at peak (indexed single-shop queries;
load test before relying on this).

| | 100 shops | 1,000 shops | 10,000 shops |
| --- | --- | --- | --- |
| Data after 1 year | 6 GB | 60 GB | 600 GB |
| Supabase plan | Pro | Pro | Pro (Team, about USD 599, only if a contract needs its compliance features) |
| Compute | Micro or Small | Medium | 2XL (then a read replica) |
| PITR | no (stage A) | yes, 7 days (stage B) | yes, 14 days |
| Supabase / month | 25 + 5 = USD 30 | 25 - 10 + 60 + 7 (disk) + 100 = USD 182 | 25 - 10 + 410 + 75 (disk) + 200 + 30 (egress) = USD 730 |
| Staging project | USD 10 | USD 10 | USD 15 |
| Vercel | Pro USD 20 | USD 20 + about 20 usage | USD 20 + about 150 usage |
| Offsite backup (S3) | about USD 1 | about USD 5 | about USD 40 (monthly dumps by then) |
| Email (summaries) | free tier | about USD 20 | about USD 100 |
| AI scans | 100 x 0.3 x 50 x 0.006 = USD 9 | USD 90 | USD 900 |
| **Total / month** | **about USD 70 (Rs 6,000)** | **about USD 350 (Rs 30,000)** | **about USD 2,100 (Rs 1.8 lakh)** |
| **Per shop / month** | about USD 0.70 (Rs 60) | about USD 0.35 (Rs 30) | about USD 0.21 (Rs 18) |
| Revenue if every shop paid Rs 99 | Rs 9,900 | Rs 99,000 | Rs 9.9 lakh |

Reading the table: infrastructure is cheap per shop at every size; the two numbers to watch
are **PITR at small scale** (why it waits for stage B) and **AI scans at large scale** (about
45% of the 10,000-shop bill; open question 7). Disk grows every year unless closed and
inactive shops are purged (3.9), which is one more reason to build closure now.
