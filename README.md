# Nexper (nexper.in) — build scaffold

> The app has moved well past this scaffold. See `PROJECT_SUMMARY.md` for what
> actually exists today; the text below is the original plan.

This is a starting skeleton for turning the working prototype
(`reference/kirana-store-app.jsx`) into a real, deployed multi-shop billing
app. Nothing here is wired up yet — every page is a stub with notes on what
to port and from where. That's intentional: Claude Code should build the
real thing feature by feature using this as the map.

## What's in this folder

- **`PROJECT_BRIEF.md`** — full feature list, data model, and what's
  already built vs. what still needs real infrastructure. Read this first.
- **`reference/kirana-store-app.jsx`** — the working prototype. Every
  feature (billing, inventory, udhaar, day close, expenses, cashbook,
  suppliers, voice billing, barcode scanning, UPI QR, WhatsApp sending,
  multi-shop switching) is already built and correct here — client-side
  only, no real backend. Port the logic and UI from here; don't redesign
  it from scratch.
- **`supabase/schema.sql`** — the real database schema (Postgres + row
  level security), matching the data model in the brief. Run this in a
  fresh Supabase project before writing any data code.
- **`app/`** — Next.js App Router structure. `app/login` and `app/(app)/*`
  are stub pages, each with a comment pointing at the exact function to
  port from the reference file.
- **`lib/supabaseClient.js`** — browser Supabase client, ready to use.

## Setup

1. `npm install`
2. Create a free project at [supabase.com](https://supabase.com).
3. In the Supabase SQL editor, run `supabase/schema.sql`.
4. Copy `.env.example` to `.env.local` and fill in your Supabase URL/anon
   key (Supabase dashboard → Settings → API).
5. `npm run dev` and open `http://localhost:3000`.

At this point the app will run but do almost nothing — that's expected.
The real work starts with auth and the shop switcher.

## Suggested build order

1. **Auth** (`app/login`) — Supabase email or phone-OTP sign-in. Every
   other screen assumes a logged-in user.
2. **Shops + sidebar** (`app/(app)/layout.js`) — fetch the user's shops,
   port the `Sidebar` component, wire the shop dropdown to real data.
   "Add shop" should insert a row into `shops` and seed a few starter
   items (see `seedItemsForShop`/`SHOP_TYPES` in the reference file for
   what to seed per business type).
3. **Inventory** — first real data screen; lowest-risk place to get the
   Supabase read/write pattern right before repeating it everywhere else.
4. **Billing** — the biggest screen; save for after the pattern is proven.
5. Everything else (History, Udhaar, Day Close, Expenses, Cashbook,
   Suppliers) — each is a fairly direct port once the pattern above is
   established.
6. **Phase 2**: WhatsApp Cloud API (replacing the `wa.me` links with real
   automatic sends), real push/SMS for low-stock alerts, GST invoicing
   polish. Details in PROJECT_BRIEF.md under "What needs to become real."

## First prompt for Claude Code

Once you've opened this folder in Claude Code:

> Read PROJECT_BRIEF.md and reference/kirana-store-app.jsx. Then follow
> the "Suggested build order" in README.md, starting with Supabase auth
> and the shop switcher. Build and verify one step at a time — show me
> each piece working before moving to the next.
