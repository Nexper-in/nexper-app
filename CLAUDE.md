# nexper-app: rules for anyone (human or AI) changing the app

Nexper is a billing, stock and udhaar app for small Indian shops
(Next.js 14 App Router + Supabase). The public website is the separate
`nexper-site` repo; this repo is the signed-in app at app.nexper.in.

## Look and feel: two themes, always both

- **Night** is the default (`:root` in `app/globals.css`), matching nexper.in:
  near-black page, soft purple and pink glow, purple-to-pink gradient on the
  main actions. **Light** (`[data-theme="light"]`) is for bright counters.
- The theme is chosen per device from the account menu (top right) and
  stored in `localStorage` (`lib/theme.js`). It is not a shop setting.
- **Never hard-code a colour in a component.** Use the variables in
  `app/globals.css`: `--text-primary`, `--text-secondary`, `--bg-surface`,
  `--bg-surface-alt`, `--border`, `--accent`, `--accent-soft-bg`,
  `--accent-soft-text`, `--danger` / `--danger-soft` / `--danger-solid`,
  `--warn…`, `--success…`, `--udhaar…`, `--strong` / `--on-strong` (selected
  pills), `--grad` (main buttons). In Tailwind write
  `text-[var(--text-secondary)]`, not `text-[#6B7280]` or `text-gray-500`.
- Main action buttons use `ks-btn-primary` (gradient). Coloured chips: set
  `--chip` and use `ks-chip`, or `categoryColor()` from `CategoryChip.js`.
- **Exceptions that stay fixed:** printed bills (`PrintBillContent.js`) and
  barcodes stay black on white; the WhatsApp green `#25D366`.
- Fonts: Manrope for headings and the wordmark, DM Sans for body text.
  The wordmark is `Ne<span class="ks-grad-text">x</span>per` with `ks-wordmark`.
- **iPhone rules:** every input, select and textarea is 16px or larger on
  phones (`app/globals.css`), because iPhone Safari zooms the page in on a
  smaller field and the app then looks too big and cut off. Pop-ups and full
  height boxes use `dvh`, not `vh`, so Safari's toolbars don't hide the bottom.
  There must be **one** viewport tag, from `export const viewport` in
  `app/layout.js`; never add a hand-written `<meta name="viewport">` (Next adds
  its own, and two made Safari ignore `maximum-scale`). Test at 402px wide
  (iPhone 17 Pro) as well as 390px.
- Check every new screen in **both** themes and at phone width (390px).
  Wide tables on the other pages become stacked cards on phones
  (`StackTables` + `.ks-stack`).

## Keep it lean

Shopkeepers use this at a busy counter. Every screen has one obvious main
action, and only what's needed for it is shown; everything else sits one
tap away (folded sections, a "⋯" menu, or the side menu).

- **Home (phone):** today's sales, **New bill**, three quick tiles (Stock, Udhaar,
  Day close) and one **Needs attention** list (max 5 rows, each with its
  fix button). Charts and other stats live under "More insights".
- **New bill (phone):** search (with scan and voice), quick item tiles, then the
  bill: items, total, **Cash / UPI / Udhaar**, **Save bill**. Customer,
  phone, discount, card and bank transfer fold under "+ Customer, discount".
  On phones a checkout bar shows while the Save button is off screen.
- **Stock (phone):** search and **Add item**; catalogue, supplier-bill scan, import
  and profit-per-item are in the "⋯" menu.
- Same words everywhere: Home, New bill, Stock, Udhaar, Bills, Day close.
  The phone top bar shows the screen name.
- Before adding a new button to a main screen, ask whether it can live in
  a fold or a menu instead.

## Layout

- **Phone and laptop have separate screens** (same app, same login) for
  Home, New bill, Stock and Udhaar. Phone is below 1024px (`useIsMobile()`
  in `lib/useIsMobile.js`), laptop from 1024px. Each of these folders has:
  `use<Screen>.js` (all data, state and actions, returns one `vm`),
  `<Screen>Mobile.js` and `<Screen>Desktop.js` (layout only), shared pieces
  in `<Screen>Parts.js`, and `page.js` choosing between them. **Change
  behaviour once, in the `use…` hook**; change layout in the screen that
  needs it. Don't add `hidden lg:block` pairs inside a screen.
- Phone screens stay lean (see below). Laptop screens use the room: Home
  shows the whole dashboard (numbers, week chart, lists); Stock shows totals
  and every tool as a button; New bill puts items and the bill side by side.
- A new text on either screen needs translations like any other (below).
- Other pages (Bills, Reports, Expenses…) are still one responsive layout.
  Split one the same way only when it needs a different laptop design.
- The account menu (`components/AccountMenu.js`) sits top right on every
  screen: name, email, Night/Light switch, Store settings, Sign out. Don't
  add another sign-out elsewhere.
- Phones: top bar (menu, shop name, account) and the bottom tab bar. Laptops:
  sidebar on the left, account menu in the top bar.

## Sign-in

- Owners register and sign in with **email and password** (with "Forgot
  password"). Staff use staff code + PIN.
- **Google sign-in is built but switched off:** the button shows with a
  "Soon" label and does nothing when tapped. It turns on when
  `NEXT_PUBLIC_GOOGLE_SIGNIN=true` is set in Vercel (then redeploy); then "Continue with
  Google" shows first and email becomes a fallback link
  (`app/login/page.js` → Supabase Google provider →
  `app/auth/callback/page.js`). Before switching it on: enable the Google
  provider in Supabase (Authentication → Providers → Google) with the Google
  Cloud OAuth client ID and secret, and add
  `https://<project>.supabase.co/auth/v1/callback` as a redirect URI in
  Google Cloud.

## Languages (English, Hindi, Telugu, Kannada, Tamil, Malayalam)

The app speaks the same six languages as nexper.in (see
`nexper-site/CLAUDE.md`). The language is chosen from the account menu (top
right) or the sign-in page, remembered on the device, and defaults to the
phone's language.

- **Every visible text goes through `t()`** (`useT()` from `lib/i18n.js`).
  The English text is the key: `t("Save bill")`, with values
  `t("Only {n} left", { n })`. Text inside constant arrays is marked with
  `T("…")` and translated when rendered: `t(item.label)`.
- **New or changed text must be added to all five files** in `i18n/`
  (`hi`, `te`, `kn`, `ta`, `ml`) in the same change. A missing translation
  shows English, but the check below fails, so it can't ship by accident.
- Run `npm run check:i18n` (or `node tools/check-i18n.mjs`). It fails on a
  missing, empty or unused translation, and when `{placeholders}` don't
  match English. `--list` prints every text, as a starting point for a file.
  GitHub runs it on every push (`.github/workflows/i18n-check.yml`).
- Same style as the website: warm counter talk, not bookish. Keep Nexper,
  WhatsApp, UPI, GST, PIN, MRP, CSV, Pro and Google in Latin letters.
  Udhaar: उधार / అప్పు / ಸಾಲ / கடன் / കടം.
- **All screens are translated** except the voice-billing pop-up, the platform
  admin pages and printed bills (these stay English on purpose). When you add or
  touch a screen, every visible text goes through `t()` (whole sentences with
  `{placeholders}`, never fragments joined around a value). Technical labels
  that must stay as they are (CSV column names, `T()` keys' English) are not
  translated.
- **The language follows the visitor from the website:** website links carry
  `?lang=`, both sites write the `nexper_lang` cookie on `.nexper.in`, and
  `lib/i18n.js` reads URL, then cookie, then this device, then the phone.
- Dates, amounts and names from the database are shown as they are. Don't
  translate user data.
- Look at a changed screen in one Indian language on a 360px phone: scripts
  run longer than English, so check nothing overflows.

## Database changes (migrations)

New tables and functions go in `supabase/migrations/NNN_*.sql`, run by hand in
the Supabase SQL editor in order. Code that depends on a new migration must fail
politely when it is missing (show "needs the latest database update"), because
the app can be deployed before the SQL is run. Current pending list is in
`PROJECT_ABDUL.md`.

## Security rules

- `SECURITY.md` has the last review and what is still open. Keep it current.
- A database function that runs as its owner (`security definer`) must check
  the caller inside, set `search_path`, and be granted explicitly. Postgres
  grants new functions to everyone by default: revoke from `public`/`anon`
  (migration 028 shows how).
- Anything that calls the Anthropic API or the service-role key lives in
  `app/api/**` and starts with the sign-in check (`lib/aiGuard.js`,
  `lib/supabaseAdmin.js`). Never import `supabaseAdmin` in a client component.
- Never put user text into HTML you build yourself (print windows,
  `document.write`, `dangerouslySetInnerHTML`): escape it.
- Don't send shop data (UPI IDs, amounts, customers) to third-party services.
  QR codes are made in the browser.
- Headers and CSP are in `next.config.js`. A new outside host (script, font,
  API) must be added there on purpose.
- `npm test` and `node tools/audit.mjs` (npm audit with a short, dated allow-list) must pass.

## Before you push

- `npx next build` and `npm run check:i18n` must pass.
- Look at the changed screens in Night and Light, on a phone width.

## Platform console (/admin)

- The owner of the platform controls pricing, GST, plans, feature switches,
  sign-up mode, banners, API and MCP from `/admin` (tabs Tenants, Onboarding,
  Pricing & tax, Features, API & MCP, Platform). Settings live in
  `platform_settings`, per-shop overrides in `tenant_controls` (migration 029).
- Defaults in `lib/platformDefaults.js` reproduce the old behaviour (plans not
  enforced, everyone gets everything). A new gated feature needs: an entry in
  `FEATURES` there, a check with `evalFeature` (client: `useShop().hasFeature`,
  server: `lib/platformConfig.js`), and a switch automatically appears in the
  console. Rule order: global kill switch, per-shop override, plan.
- Admin API routes call `requireAdmin` first, validate with `normalizeSetting`,
  and write the audit log. Admin pages stay English.
- Read API (`/api/v1/*`) and MCP (`/api/mcp`) are read-only, key based
  (`lib/apiKeys.js`, only a hash is stored), off until enabled globally and per
  shop. MCP masks customer phone numbers. Never add a write tool without a
  deliberate decision.

## Supplies (tea shops, canteens, hotels)

- `app/(app)/supplies` + `lib/supplies.js` (pure maths, unit tested). Quantities are
  written only through the `save_supply_round` database function (checks the caller,
  takes the price from the shop's own item). Do not add direct insert policies on
  `supply_entries`.
- Departments are never deleted (history stays correct); they are hidden instead.
- Any new table that holds shop data needs `shop_id`, row-level security and a case in
  `tests/db/supplies.rls.mjs` style: two shops, one must never see the other.

