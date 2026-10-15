// The list of every table: what kind of data it holds and when that data goes away.
// tests/db/catalog.mjs fails the build when a table is missing from this list, or
// breaks the rules for its kind. Adding a table = add a line here (and in
// tests/db/isolation.rls.mjs). The ORDER is parents before children: the shop
// export/import tools (T06) copy tables in this order.
//
// kind
//   tenant       the shops table itself
//   shop         has shop_id (foreign key to shops, on delete cascade, index starting with shop_id)
//   shop-child   no shop_id; hangs off a shop table: { parent, fk }
//   owner        belongs to an owner (owner_id), shared by that owner's shops
//   org          the company (organisations) and what hangs off it
//   user         belongs to one sign-in account (user_id)
//   platform     platform-only data, no browser access by owners
//   public-read  readable by everyone on purpose, written only by the server
// lifecycle (what happens to the rows)
//   root         the tenant itself
//   with-shop    deleted when the shop is deleted/purged
//   with-owner   deleted when the owner's account is deleted
//   with-org     deleted when the company is deleted
//   with-account deleted when the person's account is deleted
//   short-lived  expires within days (purged by a job)
//   keep-2y      kept 2 years, even after a shop is purged (audit)
//   platform     platform records, kept
//   config       settings, kept
// exceptions: a rule this table is excused from, with the reason (S3/S4).
// appendOnly: nobody, not even the server, may update or delete rows (S7).
export const TABLES = {
  organisations: { kind: "org", lifecycle: "with-account" },
  shops: { kind: "tenant", lifecycle: "root" },
  org_members: { kind: "org", lifecycle: "with-org" },
  shop_members: { kind: "shop", lifecycle: "with-shop" },
  products: { kind: "owner", lifecycle: "with-owner" },
  suppliers: { kind: "owner", lifecycle: "with-owner" },
  shop_products: { kind: "shop", lifecycle: "with-shop" },
  shop_suppliers: { kind: "shop", lifecycle: "with-shop" },
  bills: { kind: "shop", lifecycle: "with-shop" },
  sale_returns: { kind: "shop", lifecycle: "with-shop" },
  credits: { kind: "shop", lifecycle: "with-shop" },
  movements: { kind: "shop", lifecycle: "with-shop" },
  expenses: { kind: "shop", lifecycle: "with-shop" },
  fixed_expenses: { kind: "shop", lifecycle: "with-shop" },
  draws: { kind: "shop", lifecycle: "with-shop" },
  reconciliations: { kind: "shop", lifecycle: "with-shop" },
  stock_batches: { kind: "shop", lifecycle: "with-shop" },
  offer_posts: { kind: "shop", lifecycle: "with-shop" },
  clearance_offers: { kind: "shop", lifecycle: "with-shop" },
  clearance_offer_items: { kind: "shop-child", lifecycle: "with-shop", parent: "clearance_offers", fk: "offer_id" },
  purchase_orders: { kind: "shop", lifecycle: "with-shop" },
  purchase_order_items: { kind: "shop-child", lifecycle: "with-shop", parent: "purchase_orders", fk: "po_id" },
  supply_points: { kind: "shop", lifecycle: "with-shop" },
  supply_entries: { kind: "shop", lifecycle: "with-shop" },
  supply_payments: { kind: "shop", lifecycle: "with-shop" },
  reminder_log: { kind: "shop", lifecycle: "with-shop" },
  tenant_controls: { kind: "shop", lifecycle: "with-shop", exceptions: { closedGuard: "set by Nexper support through the server, not part of the shop's books" } },
  api_keys: { kind: "shop", lifecycle: "with-shop", exceptions: { closedGuard: "revoked when the shop closes; managed through the server" } },
  ai_usage: { kind: "shop", lifecycle: "with-shop", exceptions: { closedGuard: "a usage counter the server writes" } },
  passkeys: { kind: "user", lifecycle: "with-account" },
  passkey_challenges: { kind: "user", lifecycle: "short-lived" },
  admin_audit_log: { kind: "platform", lifecycle: "keep-2y", appendOnly: true },
  platform_admins: { kind: "platform", lifecycle: "platform" },
  support_sessions: {
    kind: "platform",
    lifecycle: "keep-2y",
    appendOnly: true,
    exceptions: {
      shopFk: "the record of who looked at a shop must outlive the shop (no foreign key on purpose)",
      shopIndex: "read by company (org_id, started_at) and by admin, never by shop alone",
    },
  },
  support_access_log: {
    kind: "platform",
    lifecycle: "keep-2y",
    appendOnly: true,
    exceptions: { shopFk: "the access log must outlive a purged shop (no foreign key on purpose)" },
  },
  platform_settings: { kind: "public-read", lifecycle: "config" },
  app_migrations: { kind: "platform", lifecycle: "platform" },
  tenant_invites: {
    kind: "platform",
    lifecycle: "platform",
    exceptions: {
      shopFk: "an invite outlives the shop it was created for (set null), so the record of who was invited stays",
      shopIndex: "a handful of rows, read by email, never by shop",
    },
  },
};

export const KINDS = ["tenant", "shop", "shop-child", "owner", "org", "user", "platform", "public-read"];
export const LIFECYCLES = ["root", "with-shop", "with-owner", "with-org", "with-account", "short-lived", "keep-2y", "platform", "config"];

// Functions that run with the owner's rights (security definer) and may be called by
// visitors who are not signed in, with the reason. Everything else must refuse anon.
// Trigger functions are excused automatically: they cannot be called directly.
export const ANON_CALLABLE = {
  is_org_member: "a yes/no check used inside row-level rules; answers false for anyone not signed in",
  is_org_owner: "same: yes/no for the rules, false when not signed in",
  can_see_org_team: "same: yes/no for the rules, false when not signed in",
};
