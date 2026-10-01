# Nexper: project record for Abdul

A running record of what has been decided and built so far, written so a new
session (or a person) can pick up without the chat history. Last updated
2026-10-01. Nothing here contains secrets. Keep it that way: this repo is
currently public.

## 1. What Nexper is

A billing, stock and udhaar (credit) app for small Indian shops (kirana,
supermarket, auto parts, clothing). Web plus installable phone app (PWA).
Domain: **nexper.in**. Brand name is **Nexper** (it was SabStore, then briefly
"Nammalekka" for a few commits).

Main user: **one person who is both owner and helper at the counter.** Hindi is
not needed at launch. Target: **a new owner makes their first bill in under 3
minutes.** The product must be simple and easy to use above everything else.

## 2. People and accounts

| Who | Role |
| --- | --- |
| maqbool (`maqbooln2022-prog`) | Owns the GitHub account, the repos and the Vercel and Supabase accounts. Admin on `SabStore`. |
| Abdul (`AbdulNandalpad`, assumed to be the same person as the Vercel team "abdulnandalpad's projects" seen in the session) | Collaborator with **Write** access on `SabStore`. Cannot change repo settings. |

Abdul has no access to maqbool's Vercel or Supabase yet. Adding him is
optional and planned for the end (steps in section 9).

## 3. Repositories and hosting (state on 2026-10-01)

- **`maqbooln2022-prog/SabStore`**: the real app. Next.js 14 + Supabase. Public
  repo, personal account, default branch `main`, no branch protection. Old
  Vercel address in the repo About box: `sab-store-one.vercel.app`.
  Working branch for this session: `claude/dreamy-shannon-cmr6ez` (same commit
  as `main` at `c2b7588`, plus whatever is committed after this file).
- **`maqbooln2022-prog/SubStoreSite`**: **not** a marketing site. A single
  3,000-line `index.html` prototype with a landing page plus a mini app
  (dashboard, inventory, new sale, history, khata, purchases, admin), navy
  branding, Firebase login (Google and phone OTP). Shop data lives in browser
  localStorage; Firestore only tracks who logged in. Contains a Firebase web
  config (normal for web apps, but its Firestore security rules were never
  checked). Treat as a legacy prototype.
- **Domain `nexper.in`** and Vercel are managed by maqbool. The session could
  not reach nexper.in (network blocked), so live state was never verified from
  here.
- **Live site problem (unresolved):** after pushing the new landing page to
  `main`, Abdul still saw the old login page. Likely causes, in order: his
  browser's old service worker cache (test `nexper.in/privacy` in a private
  window); a blocked or failed Vercel deployment (check Deployments for commit
  `c2b7588`; the commit author is "Claude"); production branch or domain not
  pointing at this project. Needs maqbool to check Vercel.

## 4. App stack (SabStore)

- Next.js 14 App Router (JavaScript), Tailwind plus custom `ks-*` classes and
  theme tokens in `app/globals.css`. Three themes via `[data-theme]`.
- Supabase: Postgres with row-level security, Auth (email and password for
  owners, a staff code plus PIN flow built on real Supabase accounts),
  `supabase/schema.sql` plus 23 migrations (`001` to `023`).
- Server routes under `app/api/` use the service-role key (`/api/staff/*`,
  `/api/admin/*`) and an Anthropic call (`/api/scan-supplier-bill`).
- Hosting: Vercel, auto-deploys from `main`. `next-pwa` builds a service worker
  in production only.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. Optional (new, in
  `lib/site.js`): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`,
  `NEXT_PUBLIC_SUPPORT_WHATSAPP`.
- Features that already exist: shop onboarding, billing (search, scan, voice,
  UPI QR, payment methods, offline queue), inventory with FIFO batches and
  expiry, clearance offers, udhaar, day close, expenses, cashbook, suppliers
  and purchase orders with payables, GST report and GSTR-1 JSON, staff roles
  and permissions, platform admin with audit log, Free/Pro plan gating
  (currently **paused**: `GATING_ENABLED = false` in `lib/pricing.js`, so every
  shop is treated as Pro). `PROJECT_SUMMARY.md` has the detailed history.

## 5. What was done, in order

1. **Explored the repo.** Concluded the real app was well past its "scaffold"
   README. Wrote down the page and component map.
2. **Rebrand to Nexper.** SabStore became "Nammalekka" (commit `4afee54`), then
   the owner chose **Nexper** (`45b9e26`). Renamed titles, manifest, login and
   reset screens, admin badge, Pro copy, localStorage keys, CSV filename, the
   internal staff email domain for **new** staff, SVG ids, `package.json`.
   `bed5f37` renamed doc and comment mentions.
   **Deliberately left unchanged:** migration `012` (real email addresses and
   the shop name "SabStore Demo" used as database lookup keys), the demo shop
   names in `PROJECT_SUMMARY.md`, the GitHub repo URL, and the bill number
   prefix `KS-` (needs a look at how numbers are generated first).
3. **GitHub push problems.** Pushes failed with HTTP 403 until the Claude GitHub
   App was installed on the repo by maqbool. After that, pushes to the branch
   and to `main` worked.
4. **Public site and mobile app polish** (`e8d4842`):
   - New route group `app/(marketing)`: landing page (hero, features, how it
     works, pricing from `lib/pricing.js`, FAQ), `/privacy`, `/terms`,
     `/contact`. Replaced the old `/` redirect to `/login`.
   - Mobile bottom tab bar (`components/BottomNav.js`): Home, Stock, New Bill,
     Udhaar, More. Hides while a text field is focused. Toast lifted above it.
   - PWA: PNG, maskable and Apple icons in `public/icons/`, fuller manifest.
   - SEO: `metadataBase`, title template, Open Graph image, `robots`, `sitemap`.
   - Login accepts `?mode=signup` and `?mode=staff`, links to legal pages.
   - `.gitignore` now ignores next-pwa output.
5. **Production hardening** (`c2b7588`): offline bills queued under the old
   `sabstore.pendingWrites` key are carried over once, so no one loses unsynced
   bills on deploy. README title renamed. Pushed to branch and **to `main` on
   the owner's explicit request.**
6. **Design artifacts (private or link-shared pages on claude.ai):**
   - User journeys: https://claude.ai/artifact/WPQZ5D9rmUit9otUcdpLvu
   - Clickable owner walkthrough (version 2, link-shared):
     https://claude.ai/artifact/4XhqDXxwUaKAuqCXksms9m
   The walkthrough is a single HTML file that was kept in the session
   scratchpad, **not in this repo**. If it needs changing, read the artifact
   back from the link.
7. **Repo review** (read-only): SabStore is public with no secrets found in all
   55 commits (local pattern scan). A few personal Gmail addresses appear in
   migration `012` and `PROJECT_SUMMARY.md`. `SubStoreSite` assessed as above.

## 6. Decisions made

- Main user is owner and helper in one. English only at launch. First bill in
  under 3 minutes.
- Sign-in: Google sign-in wanted; email and password stays. Phone OTP is a
  later option (needs an SMS provider and India's SMS registration).
- After sign-in and a two-question setup, **starter items on by default** and
  the owner lands on **New Bill with item tiles**; a "Getting started" card on
  Home holds the rest. Owners can update address, GST and UPI later.
- Honest copy only: no invented testimonials or user counts.
- Keep site and app as separate repos and domains (see section 8).

## 7. Feature backlog (agreed scope, to build feature by feature)

Each item lists what already exists in the app and what is new.

1. **Fast first bill and onboarding.** New: starter items default on, Google
   sign-in, New Bill opens first with tiles, bill-done screen, Getting started
   card, install prompt, phone-width cleanup of New Bill.
2. **Expiry dates.** Exists: FIFO batches with expiry, a dashboard risk card
   (migration `010`). New: expiry on receiving stock, an Expiry screen with
   "sell first", remove expired stock, Stock chip "Expiring soon".
3. **Offers and a customer WhatsApp group.** Exists: clearance offers with a
   date range that auto-apply at billing (migration `011`). New: offer composer
   (offer, new arrival, special), WhatsApp message preview, group invite link
   and QR poster, group link on bills, posts log.
4. **Suppliers and WhatsApp stock orders.** Exists: suppliers, purchase orders,
   payables (migrations `008`, `019`). New: suggested order from low stock,
   send on WhatsApp, receive with quantities and expiry, supplier payments.
5. **Handwritten page to bill.** Exists: supplier-bill scanning with an AI
   model. New: photograph a customer's handwritten list, match lines to items,
   review screen, add to bill. Needs the scan API to require sign-in first.
6. **Voice assistant (later).** Change prices and check stock by talking, with
   a confirm step. English only first.
7. **Later:** Razorpay for Pro, phone OTP, automatic WhatsApp sending through
   the Business API, push alerts, Hindi, Play Store wrapper.

**WhatsApp limits to remember:** apps cannot reliably create or post into
WhatsApp groups on their own. The plan is that Nexper prepares the message,
invite link and poster and the owner taps Send. Automatic two-way messages
would need the Business API credentials (not yet collected). Verify before
promising automatic posting.

## 8. Recommended architecture and build method

- **Repos:** keep `SabStore` as the app (rename later to `nexper-app`). Make
  `SubStoreSite` the marketing site only (rename `nexper-site`), after saving
  the prototype on a `legacy-prototype` branch. Move the landing and legal
  pages out of the app repo into the site repo.
- **Domains:** `nexper.in` and `www` to the site, `app.nexper.in` to the app,
  as two Vercel projects. This also stops the app's service worker from caching
  the landing page.
- **When the app moves to `app.nexper.in`:** set Supabase Auth Site URL and
  redirect URLs to it, update the Google OAuth redirect, point site buttons
  ("Start free") at the app, set the app root `/` to redirect to login or
  dashboard, update manifest `start_url` and scope, split the sitemaps.
- **Environments:** a separate Supabase project for testing and one for
  production. Write and test each migration locally on a throwaway Postgres
  first, then apply to the test project, then production.
- **Process per feature:** branch, migration plus row-level security, UI,
  checks, pull request, and a short write-up in a `docs/` folder. A full build
  document is compiled at the end, before launch.
- **Suggested order:** foundations (repo split, Google sign-in, scan endpoint
  sign-in check, email confirmation setting) then features 1 to 5, voice later.

## 9. Clean-up checklist (GitHub steps are for maqbool as owner)

Claude in Chrome cannot be driven from the cloud session, and Abdul's Write
role cannot do these anyway.

1. Optional: create a free GitHub organisation `nexper`, transfer both repos
   into it (repo Settings, General, Danger Zone, Transfer), make both partners
   Owners. Afterwards reconnect Vercel and reinstall the Claude GitHub App.
2. Rename `SabStore` to `nexper-app` and `SubStoreSite` to `nexper-site`.
3. Make the app repo **private** (Settings, General, Danger Zone).
4. Fix the About box (description and website) on both repos.
5. Protect `main` (Settings, Branches): require a pull request, block force
   pushes and deletion.
6. Raise Abdul's role to Admin (Settings, Collaborators).
7. On `SubStoreSite` create the `legacy-prototype` branch from `main`.
8. Turn on Dependabot alerts, secret scanning and push protection.
9. Add `nexper-site` to the Claude GitHub App
   (https://github.com/apps/claude/installations/select_target).

**Optional, at the end: adding Abdul to Vercel and Supabase.**
- Vercel: a personal (Hobby) account cannot have members. Create a Team (paid,
  check current pricing), Project, Settings, Transfer Project, then Team
  Settings, Members, Invite.
- Supabase: Organization, Team, Invite member by email. Some roles may need a
  paid plan.
- Never share keys or passwords in chat; use invites.

## 10. Open items and risks

- **Scan API has no sign-in check** (`app/api/scan-supplier-bill/route.js`):
  anyone can spend the Anthropic budget. Fix first, before building handwritten
  bills on it. A follow-up task was queued in the session; re-create it if
  missing.
- Live deploy of `c2b7588` unverified (section 3).
- Supabase Auth Site URL and redirect URLs must be set to the real domain or
  password-reset emails point at the wrong place.
- Support contact is empty: set the two `NEXT_PUBLIC_SUPPORT_*` env vars or the
  Contact page says channels are being set up.
- Privacy and Terms are plain-language drafts with no company name or address.
  Get them reviewed before launch.
- Pro billing is a free toggle. Razorpay keys needed.
- Repo is public and contains a few personal email addresses (migration `012`,
  `PROJECT_SUMMARY.md`). Making the repo private removes most of the concern.
- Firestore rules in `SubStoreSite` unchecked.

## 11. Open questions for Abdul and maqbool

1. Make the app repo private? (recommended yes)
2. Create the `nexper` GitHub organisation now or later?
3. After the GitHub steps are done, move the landing and legal pages to the site
   repo and point `nexper.in` at it?
4. Who creates the Supabase test project, and how are migrations applied (by
   hand or with the Supabase CLI)?
5. Is phone OTP a launch need?
6. Go-ahead to start building feature by feature (section 7), and in what order?

## 12. Practical notes for the next session

- Run the app: `npm install`, create `.env.local` with the two public Supabase
  vars (placeholders are enough to see the login and marketing pages), then
  `npm run dev`. Without a real Supabase project the signed-in screens cannot
  load data.
- To see signed-in screens without a backend, the session used a browser test
  that sets a fake `sb-<ref>-auth-token` cookie and intercepts the Supabase
  requests. Mocked shops must have a populated `enabled_modules` array or
  module pages redirect to the dashboard.
- Production builds create `public/sw.js` and workbox files. They are
  git-ignored. Do not commit them.
- `pkill -f "next dev"` inside a shell can kill that shell itself. Use a
  pattern such as `[n]ext dev`.
- Commit messages in this session end with a `Co-Authored-By` line and a
  `Claude-Session` line. Pushes went to the working branch. Pushing to `main`
  was done once, only because the owner asked for it.
