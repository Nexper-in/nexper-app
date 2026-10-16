# Silo: a client with its own Nexper

A **silo** is one client (a company) running the same code on its **own Supabase project and
its own Vercel project**. Use it only when a contract needs the data in a separate system
or region (see `docs/MULTITENANT_DESIGN.md` section 3.4). Everyone else stays on the shared
system. Nothing is built ahead of a customer: this is the checklist for the day one signs.

Rules that make it work (checked by `tests/guardrails.test.mjs`): no Supabase URL, key or
`app.nexper.in` is hard-coded in the code; the service-role key is read only in
`lib/supabaseAdmin.js`; the same repo and the same `production` branch serve every silo.
**Never make a separate code branch for a client.**

## 1. Price and contract

- Floor: at least **Rs 25,000 a month** plus a one-time setup fee. Infra is about USD 10 to
  135 a month (Micro compute about USD 10; point-in-time recovery about USD 100 if the
  contract wants it; a staging copy if they want one). Invoiced by contract, outside the app.
- Decide who runs `/admin` for the silo (it has its own console, platform settings and
  audit log; usually us).

## 2. Set up (about one day)

1. **Supabase**: new project in the region the contract names (Mumbai, ap-south-1, for
   India), Pro plan. Do the same settings as the shared project (MAQBOOL_TASKS Part 2:
   Auth URLs, MFA, timeouts, Postgres version). Save the database URL (pooler).
2. **Database**: run `node tools/migrate.mjs` against it (an empty database gets
   `schema.sql` and every update, recorded in `app_migrations`). Then `ops/readonly-role.sql`
   for the weekly drift check.
3. **Vercel**: new project from the same repo, production branch `production`, region
   `bom1`, its own domain (`<client>.nexper.in` or the client's own). Env vars (all
   different from the shared project): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (the
   silo's address), `HEALTH_TOKEN`, `NEXT_PUBLIC_NEXPER_ENV=production`,
   plus the AI and mail keys the plan needs.
   `NEXT_PUBLIC_*` values and the page's security policy (`connect-src` in `next.config.js`)
   are fixed **at build time**, so set them before the first deploy and redeploy after a change.
4. **GitHub**: new environment `silo-<name>` with its own `DATABASE_URL` (and a required
   reviewer). Add it to the production job of `.github/workflows/release.yml` as a matrix
   entry so one approval migrates the shared database and every silo, same files in the same
   order. Add it to `drift.yml` (read-only URL) and `backup.yml` (own encrypted backup) the
   same way.
5. **First sign-in**: register the owner in the silo, then make them a platform admin of
   *that* database (`platform_admins` row, run once in its SQL editor) and enrol their
   authenticator (admin sign-in needs MFA).
6. **Check**: `GET <silo>/api/health` with the token shows the app version and database
   version; it must equal the shared one.

Passkeys are tied to the web address, so silo users register their own. The language cookie
is written for `.nexper.in`; a client on its own domain gets the language from the URL and
the phone only.

## 3. Moving an existing company in

Sign-in accounts live in each database's own `auth.users`, so a move has two parts.

1. Ask the owner (and staff) to be re-created in the silo: create the same users there
   with the same user ids (the dashboard's Auth page or an admin `createUser` with a fixed
   `id`; **not yet tried against real Supabase, test on staging first**) so the shop's
   `shop_members` rows still point at real people. Staff use code + PIN, so give them new PINs.
2. Per shop: `node tools/shop-export.mjs --from <shared url> --shop <id> --out shop.json`,
   then `node tools/shop-import.mjs --to <silo url> --file shop.json --dry-run`, then again
   without `--dry-run`. The dry run does everything and rolls it back. The file holds
   customer names and phones: keep it private and delete it afterwards.
3. Check bills, balances and stock in the silo with the owner, point the owner to the new
   address, then **close** the shop in the shared system (it becomes read-only and stays
   that way until someone reopens it). Do not delete it by hand.
4. Mark the company in the shared console (`org_controls.deployment = '<name>'`) so nobody
   bills it twice.

## 4. Running it

- A release goes to the silo with the same approval as production (step 2.4); a silo can
  never be behind or ahead for long, because the weekly drift check and the health call
  compare versions.
- Restore, support access, closing and the trash work exactly as in the shared system
  (`docs/RUNBOOK_RESTORE.md`, `SECURITY.md`), against the silo's own database.
- When there are more than about five silos, per-silo deployments become the bigger cost.
  That is the time to look at routing many databases from one deployment, not before.
