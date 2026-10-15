import test from "node:test";
import assert from "node:assert/strict";
import { readRawShop } from "../lib/exportData.js";
import { SHOP_EXPORT, EXPORT_FORMAT } from "../lib/shopTables.js";

// A tiny stand-in for the Supabase client: select / eq / in / order / range over arrays.
function fake(db) {
  return {
    rpc: async () => ({ data: "036", error: null }),
    from(table) {
      let rows = db[table] || [];
      const q = {
        maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
        select: () => q,
        eq: (c, v) => ((rows = rows.filter((r) => r[c] === v)), q),
        in: (c, vs) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        order: () => q,
        range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      };
      return q;
    },
  };
}

test("readRawShop reads every listed table for one shop and nothing of another", async () => {
  const db = {
    shops: [{ id: "s1", owner_id: "o", org_id: "org1" }, { id: "s2", owner_id: "o", org_id: "org1" }],
    organisations: [{ id: "org1", name: "Co", owner_id: "o", max_shops: 3 }],
    shop_members: [{ id: 1, shop_id: "s1", user_id: "u1", via_org: null }, { id: 2, shop_id: "s1", user_id: "u2", via_org: "org" }, { id: 3, shop_id: "s2", user_id: "u1", via_org: null }],
    shop_products: [{ id: "sp1", shop_id: "s1", product_id: "p1" }, { id: "sp2", shop_id: "s2", product_id: "p2" }],
    products: [{ id: "p1" }, { id: "p2" }],
    bills: [...Array(2500)].map((_, i) => ({ id: "b" + i, shop_id: i % 5 === 0 ? "s2" : "s1" })),
    purchase_orders: [{ id: "po1", shop_id: "s1" }],
    purchase_order_items: [{ id: "i1", po_id: "po1" }, { id: "i2", po_id: "other" }],
  };
  const raw = await readRawShop(fake(db), "s1");
  assert.equal(raw.format, EXPORT_FORMAT);
  assert.deepEqual(Object.keys(raw.tables), SHOP_EXPORT.map((s) => s.table));
  assert.equal(raw.tables.shops.length, 1);
  assert.equal(raw.dbVersion, "036");
  assert.equal(raw.company.id, "org1");
  assert.deepEqual(raw.tables.shop_members.map((m) => m.id), [1], "company team rows and other shops' members are left out");
  assert.deepEqual(raw.tables.products.map((p) => p.id), ["p1"], "only the master items this shop uses");
  assert.equal(raw.tables.bills.length, 2000, "paged past the 1000-row limit, only this shop");
  assert.deepEqual(raw.tables.purchase_order_items.map((i) => i.id), ["i1"], "child rows come through their parent");
});
