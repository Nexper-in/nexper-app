# Backups and restores

> **Status: on Supabase's Free plan (no plan backups), so the weekly `backup` workflow is the only copy of the data outside the live database.** It stores an encrypted dump as a GitHub Actions artifact (not S3 — no AWS account used), kept 90 days. Set it up once: generate the age key (below), add the two secrets to the `production-backup` environment, then run it once manually to confirm it works. Move to Supabase Pro's daily backups when the business can justify the cost; this workflow can keep running alongside that too.

What we have, how to get data back, and the test that proves it works. Read this once
before you need it.

## What exists

| Layer | What | Kept | Restores |
| --- | --- | --- | --- |
| Supabase daily backup | automatic, Pro plan only — not active while on Free | 7 days | the whole project (dashboard, Database, Backups) |
| Weekly GitHub-stored dump | `.github/workflows/backup.yml`: encrypted `pg_dump`, stored as a GitHub Actions artifact | 90 days (GitHub's own limit) | a whole database, or one shop (below) |
| Owner's own backup | Store settings, "Download backup" (spreadsheets + `data.json`) | the owner's computer | one shop, with `tools/shop-import.mjs` |
| Trash for deleted rows | 30 days (task T16) | in the database | a deleted item, supplier, staff member... |
| Point-in-time recovery | not bought yet (stage B, about 450 paying shops or the first chain contract) | | |

**Targets until PITR:** we can lose up to 24 hours of bills in a disaster (RPO 24 h), and a
whole-database restore should take under 4 hours (RTO 4 h). One shop: one working day.
A purged shop can still sit in a backup for up to 8 weeks (the privacy policy says so).

## Set up the backup key (once, on Maqbool's own computer)

The dumps are encrypted with a public key; only the private key opens them. The private
key never goes into GitHub, chat or email.

```
age-keygen -o nexper-backup-key.txt
```

It prints `Public key: age1...`. Put that one line (starting `age1`) into the file
`ops/backup.pub` in the repo (GitHub web editor, replace the whole content, commit to `main`).
Keep `nexper-backup-key.txt` in **two** offline places (for example an encrypted USB stick at
home and a printed copy in a locked drawer; a second copy with Abdul). If the key is lost
every backup is unreadable, so check both copies each quarter. (Install: `sudo apt install
age`, or `brew install age`, or download from https://github.com/FiloSottile/age.)

## One-time setup (no AWS account — the dump is stored as a GitHub Actions artifact)

1. GitHub, Settings, Environments: create `production-backup` (no reviewers — the job must
   run unattended on its Sunday schedule). Secrets: `DATABASE_URL` (the real project's
   **session pooler** connection string; the backup needs to read every row, so it uses the
   main `postgres` login), `DATABASE_CA_PEM` (optional, the project's SSL certificate text).
   Repository variable `PG_MAJOR`: the Postgres major version of the project (Supabase,
   Project Settings, Infrastructure; for example 17).
2. Keep `main` protected (pull request required) so nobody can change the backup workflow
   without a review: it can read everything.
3. Practice run: Actions, `backup`, Run workflow, target `staging` (needs the same two
   secrets in a `staging` environment, pointed at `nexper-staging` instead). Then run it for
   real (target `production-backup`).
4. The encrypted dump lands as a downloadable artifact on that run's page (Actions → the
   `backup` workflow → the run → Artifacts, near the bottom). GitHub deletes it automatically
   after 90 days — download a copy somewhere else if you want to keep one longer, or raise
   `RETENTION_DAYS` in `.github/workflows/backup.yml` (up to what the GitHub plan allows).

## Whole-database restore (disaster, or the quarterly test)

Target: a **new, empty** Supabase project in Mumbai (for a disaster: a new project that will
become production; for the test: a scratch project, or `nexper-staging` if you wipe it first).
This procedure was tried on a real Postgres 16 with the real schema.

1. Download both files for the date you want and decrypt them with the private key. GitHub,
   Actions → `backup` → the run for that date → scroll to **Artifacts** → download
   `nexper-backup-DATE` (a zip holding both `.dump.age` files) and unzip it. Then:
   ```
   age -d -i nexper-backup-key.txt -o nexper.dump nexper-DATE.dump.age
   age -d -i nexper-backup-key.txt -o nexper-auth.dump nexper-DATE-auth.dump.age
   ```
2. Use `pg_restore` of the **same major version** as the dump (see PG_MAJOR). Connection
   string of the new project: Connect, Session pooler (`TARGET_URL`).
3. Sign-in accounts first, then the app (the order matters: the app tables point at users):
   ```
   pg_restore --no-owner --data-only --dbname="$TARGET_URL" nexper-auth.dump
   pg_restore --no-owner --dbname="$TARGET_URL" nexper.dump
   ```
   The second command prints **one** expected error, `schema "public" already exists`, and
   "errors ignored on restore: 1". Any other error: stop and ask Abdul.
4. Check what came back: `psql "$TARGET_URL" -f ops/verify-restore.sql`. Compare the rows per
   table and the newest bill date with what you expect.
5. Run the database tool so the update list is correct: `DATABASE_URL="$TARGET_URL" npm run
   db:migrate -- --dry-run` should say nothing to apply (the dump carries `app_migrations`).
6. Disaster only: point production at the new project (Vercel environment variables
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   Supabase Auth URL settings, GitHub `production` environment `DATABASE_URL`), redeploy, and
   tell shops that bills made after the backup date have to be re-entered. People who signed in
   with passkeys must register again if the site address changed.
7. Not restored by this dump: Supabase Auth settings (SMTP, URLs, providers), sessions
   (everyone signs in again), and uploaded files (the app stores none).

Time it. Write the times in the log below.

## Restore one shop

When one shop lost data and the rest of the platform is fine, never roll the whole database
back. Instead:

1. Restore the last backup that still has the data into a **scratch** project with the steps
   above. (If the owner has their own backup zip: its `data.json` is the same file format, so
   skip to step 2 and use it as `shop.json` after both databases are at the same update.)
2. Check what is missing with a dry run, then copy it back:
   ```
   node tools/shop-export.mjs --from "$SCRATCH_URL" --shop SHOP_ID --out shop.json
   node tools/shop-import.mjs --to "$PROD_URL" --file shop.json --mode missing-only --dry-run
   node tools/shop-import.mjs --to "$PROD_URL" --file shop.json --mode missing-only
   ```
   `missing-only` adds rows that are gone and leaves everything that exists. `replace` is for
   a shop that must be put back exactly as it was at the backup (it removes that shop's newer
   rows first) and should be used only after the owner agrees in writing. Neither ever touches
   another shop's rows.
3. The release workflow `restore-shop` runs the same thing with approval (Actions, Restore
   shop).

## Quarterly restore test

Once every three months, Maqbool restores the latest weekly dump into a scratch project with
the whole-database steps, runs `ops/verify-restore.sql`, and fills one line here:

| Date | Backup date | Who | Time to restore | Rows look right (bills, shops) | Problems |
| --- | --- | --- | --- | --- | --- |
| (first test not done yet) | | | | | |

If the restore takes more than 4 hours, or the key cannot be found, that is a problem to fix
that week (see section 3.8 of `docs/MULTITENANT_DESIGN.md`).

## Who holds what

| Item | Held by |
| --- | --- |
| age private key | Maqbool (two offline copies) and Abdul (one copy) |
| Supabase and GitHub owner accounts | Maqbool and Abdul, MFA on |
