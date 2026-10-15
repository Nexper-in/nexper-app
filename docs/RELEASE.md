# How a release works

Short version: merge to `main` updates **staging** by itself. Production waits for one
click from Maqbool, then the database is updated first, checked, and only then the app is
released. If the database step is red, the app is untouched.

```
merge to main
   |
   v
verify  (tests, translations, audit, build)         automatic
   |
   v
staging (database updates on nexper-staging)        automatic
   |      Vercel deploys main to staging.nexper.in
   v
production  ---- waits for Maqbool: "Approve and deploy"
   |  1. dry run: lists what would run
   |  2. database updates on nexper-prod (one transaction per update)
   |  3. read-only checks (ops/verify.sql)
   |  4. app released: branch "production" moves to this commit, Vercel deploys it
   v
https://app.nexper.in
```

## What Maqbool does for each release (and nothing else)

1. GitHub emails "Deployment review: production is waiting". Open the link.
2. Open https://staging.nexper.in, sign in as `owner@staging.nexper.in`, and do the checks in
   the run's summary (normally: make a bill, open Udhaar, open /admin; about 3 minutes).
3. Back in GitHub: **Review deployments**, tick **production**, **Approve and deploy**.
4. Wait for the green tick (2 to 5 minutes). If it is red: do nothing else and send the link
   to Abdul. Production is untouched, because the app is only released after the database
   step succeeded.
5. Open https://app.nexper.in/admin, Platform tab (once task T04 is in): "Database: up to
   date". Done.

If two merges happen before an approval, GitHub keeps only the newest waiting release; the
release note lists everything since the last production release.

## Rules for the people writing code

- A database update is a new file `supabase/migrations/NNN_name.sql`, ending with
  `select record_migration('NNN', 'NNN_name.sql');`. Never edit one after it has been
  applied: the runner compares checksums and fails the release.
- **Database first, then app.** Every update must work with the app version that is live
  right now (add columns and tables in one release, remove old ones in a later release and
  mark that file `-- nexper:contract`). Code that needs an update checks
  `useDbVersion().atLeast("NNN")` and shows "needs the latest database update" otherwise.
- `npm run test:db` runs the same migration code against an in-memory database, so a broken
  update fails the pull request, not the release.
- To try the pipeline's database step against any database yourself:
  `DATABASE_URL=... npm run db:migrate -- --dry-run`, then without `--dry-run`.

## Emergency fallback (no GitHub)

Paste the update file into the Supabase SQL editor. Because every file from 036 on ends with
`record_migration(...)`, it records itself, and the next release sees it as done.

## One-time setup

The list is in `MAQBOOL_TASKS.md`, part 5. In short: a second Supabase project
`nexper-staging` (Mumbai), three GitHub environments (`staging`, `production` with Maqbool as
required reviewer, `production-readonly`), a branch `production`, and Vercel pointed at it.

| Where | Name | Holds |
| --- | --- | --- |
| GitHub environment `staging` | `DATABASE_URL` | session pooler string of nexper-staging |
| | `DATABASE_CA_PEM` | Supabase "SSL certificate" text (optional but recommended) |
| | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_TEST_PASSWORD` | only for "Seed staging" |
| GitHub environment `production` | `DATABASE_URL`, `DATABASE_CA_PEM` | nexper-prod (changes the database: needs approval) |
| GitHub environment `production-readonly` | `DATABASE_URL`, `DATABASE_CA_PEM` | the limited `nexper_drift` login (ops/readonly-role.sql) |

Never paste these anywhere but the GitHub secret field. They hold database passwords.

## The weekly drift check

`.github/workflows/drift.yml` reads staging and production (structure and recorded updates
only, never shop data) and opens an issue "Database drift found" if either differs from the
repository, or if they differ from each other at the same update number. A pending release
(staging ahead of production) is not drift and is reported as a note.

## Not verified yet

These need the real accounts and were not exercised from the build machine: GitHub
environments and the approval prompt, Vercel deploying branch `production` after a push
made by the workflow, the Supabase pooler certificate. The migration runner, the read-only
checks, the snapshot and the drift comparison were run against a real Postgres 16 and the
in-memory database.
