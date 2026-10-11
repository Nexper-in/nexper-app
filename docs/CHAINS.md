# Chains: one owner, many shops

A prospect may run a chain: several shops, each with its own stock, bills and
udhaar, and one owner who wants to open each shop on its own **and** see all of
them added together, compare stock between shops and move stock from one shop to
another. This note is the agreed design and the state of each step.

## 1. The model (built, migration 035)

```
organisation (the company)  1 ── n  shops   (each shop keeps its own data, shop_id as before)
organisation                1 ── n  org_members (owner / manager / area_manager / analyst)
```

- **Every owner has a company**, even a single-shop owner (created automatically,
  `max_shops = 1`). Nothing changes for them. The platform owner raises
  `max_shops` for a chain in `/admin` (Tenants, Manage, "Shops this company may have").
- **Each shop stays a tenant.** All shop tables keep `shop_id` and the same
  row-level-security rules. Shop data is never mixed in one place; combined views read
  across the company's shops, and only for people the company layer allows.
- **Company roles are copied into `shop_members`** rows marked `via_org`, one per shop
  the person covers (kept in sync by triggers). So every existing policy and screen keeps
  working with no change, and one login can switch between shops. A direct shop
  membership always wins over a company one. Staff (code + PIN) are unchanged and belong
  to one shop only.

| Role | Sees | Can do |
| --- | --- | --- |
| Owner | every shop | everything, including add a branch, the team, delete a shop |
| Manager | every shop | billing, stock, udhaar, reports; no settings, team or delete |
| Area manager | the shops chosen | same as manager for those shops only |
| Analyst | every shop | read sales, bills, reports; change nothing |

## 2. What is built now (phase 1)

- Several shops per owner (the old "one shop per owner" rule is replaced by `max_shops`).
- **Company** screen (side menu, only for owners and managers of a chain): the shops,
  "Add a branch" (optionally copying the item list of another shop with prices, stock at
  zero), and the team with roles.
- **Shop switcher** in the side menu.
- Admin console: shops-per-company limit.
- 48 database checks in `tests/db/orgs.rls.mjs` (limit, roles, forged `via_org`,
  another company sees nothing, owner transfer) and the isolation test over every table.

## 3. Next steps

**Phase 2: combined numbers.** A small per-shop-per-day summary table (`shop_day_stats`:
bills, sales by Cash/UPI/Udhaar, GST, profit, returns), filled when a bill is saved and
by a nightly catch-up. Company Home and Reports read it, so a 100-shop chain is a
few thousand rows a day, never a scan of every bill. Chain Home: today per shop and
total, best and weakest shop, week chart, "needs attention" across shops. GST is grouped
by GSTIN.

**Phase 3: stock across shops.**
- Compare: one table, items down, shops across, with total and low-stock flags.
- Transfers (`stock_transfers` + lines): draft, in transit, received (or received short,
  or cancelled). Only inside one company. Done by database functions that check the
  caller and move the numbers: the sender's stock goes down when sent, the receiver's goes
  up only when they confirm what arrived, and a difference is recorded, never lost.
  Stock in transit is shown as such. A delivery slip can be printed.
- Items are matched across shops by the shared catalogue product (`product_id`), so
  "Tata Salt 1kg" is one item everywhere.

**Phase 4: finishing.** Shared price lists with per-shop overrides, a central warehouse
shop type (receives from suppliers, ships to branches), area-manager views and alerts.

## 4. Open questions (defaults used until answered)

1. Same prices in every shop, or per shop? *Default: copied at branch creation, each shop
   can change.*
2. A central warehouse? *Default: not yet; any shop can send to any shop.*
3. Does the receiving shop confirm transfers? *Default: yes.*
4. One GSTIN or one per shop? *Default: per shop. Transfers between different GSTINs are a
   tax matter (invoice or delivery challan): confirm with a CA before building that part.*
5. Customers and udhaar across shops? *Default: separate per shop (a customer owing in
   shop A is not shown in shop B).*
6. Billing: one subscription per company or per shop? *Default: per company, shops allowed
   by `max_shops`.*
7. How big is the first chain (shops, items per shop)?
8. Who is the first prospect and what do they most want to see?

## 5. Known trade-offs

- Adding someone to the company team looks up their Nexper account by email, so the
  owner learns whether an address has an account. Acceptable for an owner-only action;
  revisit with invitations if it becomes a concern.
- Combined screens for very large chains rely on the daily summary (phase 2); until then
  they are per shop.
