# Maqbool: everything to do for Nexper

For whoever has access to **Supabase**, **Vercel** and the **domain** (maqbool).
Do the steps in order. Each one says how to check it worked. Nothing here is a
secret: never paste real keys into chat or into a file in the repo.

Time needed: about 45 minutes, plus waiting for DNS.

---

## A. Database (Supabase, SQL editor)

Open the Supabase project, then **SQL Editor**. Run each file from
`supabase/migrations/` in the repo, **one at a time, in this order**, after 023:

| # | File | What it gives |
| --- | --- | --- |
| 1 | `024_write_off_batch.sql` | Removing expired stock |
| 2 | `025_offers_whatsapp_group.sql` | Saving the customer WhatsApp group link |
| 3 | `026_receive_po_with_quantities.sql` | Receiving a purchase order with quantities and expiry |
| 4 | `027_default_modules_include_reports.sql` | Reports on for new shops |
| 5 | `028_lock_down_function_access.sql` | **Security fix. Do this one first if you do nothing else.** |
| 6 | `029_platform_console.sql` | Everything the new admin console needs |

If a file says something "already exists", that step was done before; carry on.

**Check 028 worked** (run this, the answer must be `false`):

```sql
select has_function_privilege('anon','admin_transfer_shop_ownership(uuid,uuid)','execute');
```

**Check 029 worked** (must list 5 tables):

```sql
select table_name from information_schema.tables
where table_name in ('platform_settings','tenant_controls','tenant_invites','api_keys','ai_usage');
```

## B. Make the platform admins (SQL editor)

Only people in this table can open `/admin`. Each person must first sign up in
the app with that email. Then run (change the email):

```sql
insert into platform_admins (user_id)
select id from auth.users where email = 'you@example.com';
```

Keep it to 1 or 2 people. Remove someone:

```sql
delete from platform_admins where user_id = (select id from auth.users where email = 'you@example.com');
```

Admin sign-in page: `https://app.nexper.in/admin/login` (type the address; the
app does not link to it).

## C. Supabase settings (dashboard)

**Authentication**

1. **URL Configuration**: Site URL = `https://app.nexper.in`. Redirect URLs: add
   `https://app.nexper.in/**` and nothing else (remove localhost and old
   addresses once live). Without this, password-reset emails point at the wrong
   place.
2. **Sign In / Providers, Email**: confirm email **on**; minimum password length
   **8 or more**.
3. **Password protection**: turn on **leaked password protection** if shown.
4. **SMTP** (Project Settings, Authentication, SMTP): set your own email sender
   (Resend, Brevo, or similar). The built-in sender allows only a few emails an
   hour, which breaks sign-up confirmations and admin invites.
5. Optional, later: **Google** provider (see section F).

**API keys** (Project Settings, API): copy the project URL, the `anon` key and the
`service_role` key for the next section. The `service_role` key is a secret.

## D. Vercel (project `nexper-app`, Settings, Environment Variables)

Set for **Production** (and Preview if you use it), then **Redeploy**.

| Name | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **secret, never `NEXT_PUBLIC_`** |
| `ANTHROPIC_API_KEY` | key from console.anthropic.com | **secret**, for bill and handwriting scanning; set a monthly spend limit there |
| `NEXT_PUBLIC_SITE_URL` | `https://nexper.in` | where Sign out and links go |
| `NEXT_PUBLIC_APP_URL` | `https://app.nexper.in` | where invite emails land |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | support email | shown in the app |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | digits only, e.g. `919876543210` | shown in the app |
| `NEXT_PUBLIC_GOOGLE_SIGNIN` | `false` for now | `true` only after section F |

Never put the `service_role` or Anthropic key in a variable starting with
`NEXT_PUBLIC_`: those are sent to every visitor.

## E. Domain and the two sites

1. Vercel, project `nexper-app`, **Settings, Domains**: add `app.nexper.in`.
   At the DNS provider add the record Vercel shows (usually a CNAME for `app` to
   `cname.vercel-dns.com`). Wait until Vercel shows it as valid.
2. `nexper.in` stays on the `nexper-site` project (already live).
3. In the repo `nexper-app`, `public/manifest.json`: change `start_url` only if you
   want the installed phone app to open somewhere other than `/billing`
   (usually leave it).
4. Tell Abdul/Claude when `app.nexper.in` is live; the website's "Start free"
   buttons then get pointed at it (a one-line change, in `nexper-site`).

**Check:** open `https://app.nexper.in`, sign up with a test email, make a first
bill, sign out (you should land on nexper.in).

## F. Google sign-in (optional, later)

1. Google Cloud Console: create an OAuth client (Web). Add
   `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect.
   (The old prototype's Firebase project `nexper-fd4f1` already has a client you
   can reuse.)
2. Supabase, Authentication, Providers, **Google**: paste client ID and secret.
3. Vercel: set `NEXT_PUBLIC_GOOGLE_SIGNIN=true`, redeploy.

## G. Test the admin console (after A to D)

1. Sign in at `/admin/login` as an admin from section B.
2. **Pricing & tax**: set the Pro price and GST (the defaults are Rs 99 / Rs 899
   a year, 18% GST). Leave **Enforce plans** off while everyone is testing.
3. **Platform**: set an announcement banner to see it appear in the app.
4. **API & MCP**: leave both switches **off** unless you want an accountant or an
   AI assistant to read a shop's numbers. If you turn them on, also turn them on
   for that shop in **Tenants, Manage**, then make a key (shown once).
5. **Onboarding**: choose the sign-up mode. Use **Open** while testing; **Invite
   only** when you want to control who joins.

**Before taking any money:** turn **off** "Let owners switch plan themselves" in
Pricing & tax, so only you can change a plan.

## H. Things only the business can supply

- Support email and WhatsApp number (sections D and the website's
  `nexper-site/tools/build.py`, `SUPPORT_EMAIL` and `SUPPORT_WHATSAPP`).
- Company name, registered address and GSTIN: for the Privacy and Terms pages and
  for Pricing & tax in the console.
- A person who reads Hindi, Telugu, Kannada, Tamil and Malayalam to review the
  translations and the legal pages (they are plain drafts).
- Later: Razorpay account (payments), WhatsApp Business API, a shared rate limiter
  (Upstash or Vercel KV) before heavy public use.

## Quick checklist

- [ ] A. Run SQL 024 to 029 and both checks
- [ ] B. Add admin(s) to `platform_admins`
- [ ] C. Supabase Auth URLs, password rules, SMTP
- [ ] D. Vercel environment variables, redeploy
- [ ] E. `app.nexper.in` domain, test sign-up and first bill
- [ ] G. Open `/admin`, check each tab
- [ ] H. Send the support contact and company details
