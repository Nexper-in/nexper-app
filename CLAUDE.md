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
- Check every new screen in **both** themes and at phone width (390px).
  Wide tables need a phone layout (see `ks-only-mobile` / `ks-only-desk` on
  the Stock and Udhaar pages).

## Keep it lean

Shopkeepers use this at a busy counter. Every screen has one obvious main
action, and only what's needed for it is shown; everything else sits one
tap away (folded sections, a "⋯" menu, or the side menu).

- **Home:** today's sales, **New bill**, three quick tiles (Stock, Udhaar,
  Day close) and one **Needs attention** list (max 5 rows, each with its
  fix button). Charts and other stats live under "More insights".
- **New bill:** search (with scan and voice), quick item tiles, then the
  bill: items, total, **Cash / UPI / Udhaar**, **Save bill**. Customer,
  phone, discount, card and bank transfer fold under "+ Customer, discount".
  On phones a checkout bar shows while the Save button is off screen.
- **Stock:** search and **Add item**; catalogue, supplier-bill scan, import
  and profit-per-item are in the "⋯" menu.
- Same words everywhere: Home, New bill, Stock, Udhaar, Bills, Day close.
  The phone top bar shows the screen name.
- Before adding a new button to a main screen, ask whether it can live in
  a fold or a menu instead.

## Layout

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
- **Screens translated so far:** menus and tabs, account menu, Home, New bill
  (and the quantity picker), the Stock and Udhaar lists, sign-in, offline
  banner. The other screens (reports, expenses, suppliers, staff, the pop-up
  forms…) are still English: when you touch one, wrap its text in `t()` and
  add the translations.
- Dates, amounts and names from the database are shown as they are. Don't
  translate user data.
- Look at a changed screen in one Indian language on a 360px phone: scripts
  run longer than English, so check nothing overflows.

## Before you push

- `npx next build` and `npm run check:i18n` must pass.
- Look at the changed screens in Night and Light, on a phone width.
