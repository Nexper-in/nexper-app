// Which tables make up one shop's books, in the order they must be loaded (parents first).
// Used by the owner's backup (data.json), tools/shop-export.mjs and tools/shop-import.mjs.
// A new table that holds shop data must be listed here or in NOT_EXPORTED with a reason:
// tests/db/catalog.mjs fails otherwise, so no shop table is ever left out of a restore.
//
// by: "self"   the shops row itself
//     "shop"   rows with shop_id = the shop
//     "child"  rows whose `fk` points at a row of `parent` that belongs to the shop
//     "owner"  rows of the owner's shared master data that the shop uses (via `via`.`fk`)
export const SHOP_EXPORT = [
  { table: "shops", by: "self" },
  { table: "shop_members", by: "shop", notNull: "via_org", note: "company team members are re-created from the company" },
  { table: "products", by: "owner", via: "shop_products", fk: "product_id" },
  { table: "suppliers", by: "owner", via: "shop_suppliers", fk: "supplier_id" },
  { table: "shop_products", by: "shop" },
  { table: "shop_suppliers", by: "shop" },
  { table: "bills", by: "shop" },
  { table: "sale_returns", by: "shop" },
  { table: "credits", by: "shop" },
  { table: "movements", by: "shop" },
  { table: "expenses", by: "shop" },
  { table: "fixed_expenses", by: "shop" },
  { table: "draws", by: "shop" },
  { table: "reconciliations", by: "shop" },
  { table: "stock_batches", by: "shop" },
  { table: "offer_posts", by: "shop" },
  { table: "clearance_offers", by: "shop" },
  { table: "clearance_offer_items", by: "child", parent: "clearance_offers", fk: "offer_id" },
  { table: "purchase_orders", by: "shop" },
  { table: "purchase_order_items", by: "child", parent: "purchase_orders", fk: "po_id" },
  { table: "supply_points", by: "shop" },
  { table: "supply_entries", by: "shop" },
  { table: "supply_payments", by: "shop" },
  { table: "reminder_log", by: "shop" },
  { table: "game_stations", by: "shop" },
  { table: "game_sessions", by: "shop" },
];

// Shop-level tables deliberately left out, with the reason.
export const NOT_EXPORTED = {
  tenant_controls: "platform settings for the shop, set by Nexper support",
  api_keys: "secrets of the read API: they are re-issued, never copied",
  ai_usage: "a usage counter for billing, not the shop's books",
  shop_day_stats: "derived from the shop's books (rebuilt by refresh_shop_day_stats), not a source of truth",
  client_errors: "diagnostic error reports, purged after 30 days",
};

export const EXPORT_FORMAT = 1;
