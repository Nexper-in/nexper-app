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

## Languages

The website is in six languages (see `nexper-site/CLAUDE.md`). The app is
English only for now. When the app is translated, follow the same rule:
every visible string goes into every language in the same change.

## Before you push

- `npx next build` must pass.
- Look at the changed screens in Night and Light, on a phone width.
