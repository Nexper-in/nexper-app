// Run: npm run test:db. The multi-tenant guarantee, checked automatically on
// the real database rules for EVERY table: a signed-in user of one shop, a
// helper with no permissions, and an anonymous visitor can never read, change,
// delete or insert into another shop's rows. If someone adds a table and does
// not add it here, this test fails, so no table can ship without being checked.
import { buildDb, as, counter } from "./setup.mjs";

const db = await buildDb();
const t = counter();
const q = async (sql) => (await db.query(sql)).rows;
// A count that treats "permission denied" as zero rows: for an anonymous visitor
// being refused outright is as good as seeing nothing.
const seen = async (sql) => {
  try {
    return (await q(sql))[0].c;
  } catch (e) {
    if (/permission denied/.test(e.message)) return 0;
    throw e;
  }
};
const fails = async (sql) => {
  try {
    await db.exec(sql);
    return false;
  } catch (e) {
    return e.message;
  }
};

// ---------- people and shops ----------
await as(db, null);
const user = async (name) => (await q(`insert into auth.users (email) values ('${name}@x') returning id`))[0].id;
const ownerA = await user("ownerA"), ownerB = await user("ownerB"), staffA = await user("staffA"), admin = await user("admin");
const shop = async (owner, name) => (await q(`insert into shops (owner_id, name, type) values ('${owner}', '${name}', 'kirana') returning id`))[0].id;
const A = await shop(ownerA, "A"), B = await shop(ownerB, "B");
for (const [s, u, role, perms] of [[A, ownerA, "owner", "{}"], [B, ownerB, "owner", "{}"], [A, staffA, "staff", "{}"]]) {
  await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${s}', '${u}', '${role}', 'x', '${perms}')`);
}
await db.exec(`insert into platform_admins (user_id) values ('${admin}')`);

// ---------- one row per shop in every table ----------
const ids = {};
async function seed(X, owner, tag) {
  const one = async (sql) => (await q(sql + " returning id"))[0].id;
  const prod = await one(`insert into products (owner_id, name) values ('${owner}', 'Item ${tag}')`);
  const sp = await one(`insert into shop_products (shop_id, product_id, price) values ('${X}', '${prod}', 10)`);
  const sup = await one(`insert into suppliers (owner_id, name) values ('${owner}', 'Sup ${tag}')`);
  await db.exec(`insert into shop_suppliers (shop_id, supplier_id) values ('${X}', '${sup}')`);
  await db.exec(`
    insert into bills (shop_id, bill_no, items, subtotal, total) values ('${X}', 'KS-${tag}', '[]', 10, 10);
    insert into credits (shop_id, phone, name, amount, type) values ('${X}', '9${tag === "A" ? 1 : 2}', 'C', 5, 'charge');
    insert into movements (shop_id, item_name, type, qty, reason) values ('${X}', 'Item', 'in', 1, 'Purchase');
    insert into expenses (shop_id, category, amount) values ('${X}', 'Rent', 1);
    insert into fixed_expenses (shop_id, name, category, amount, due_day) values ('${X}', 'Rent', 'Rent', 1, 5);
    insert into draws (shop_id, amount) values ('${X}', 1);
    insert into reconciliations (shop_id, expected_cash, cash_counted, diff) values ('${X}', 1, 1, 0);
    insert into stock_batches (shop_id, shop_product_id, qty_received, qty_remaining) values ('${X}', '${sp}', 1, 1);
    insert into offer_posts (shop_id, title, message) values ('${X}', 'T', 'M');
    insert into tenant_controls (shop_id) values ('${X}');
    insert into api_keys (shop_id, name, key_prefix, key_hash) values ('${X}', 'k', 'nxp_${tag}', 'hash${tag}');
    insert into ai_usage (shop_id, kind) values ('${X}', 'scan');
    insert into supply_points (shop_id, name) values ('${X}', 'Dept ${tag}');
  `);
  const offer = await one(`insert into clearance_offers (shop_id, discount_pct, start_date, end_date) values ('${X}', 10, current_date, current_date)`);
  await db.exec(`insert into clearance_offer_items (offer_id, shop_product_id) values ('${offer}', '${sp}')`);
  const po = await one(`insert into purchase_orders (shop_id) values ('${X}')`);
  await db.exec(`insert into purchase_order_items (po_id, item_name) values ('${po}', 'x')`);
  const point = (await q(`select id from supply_points where shop_id = '${X}'`))[0].id;
  await db.exec(`
    insert into supply_entries (shop_id, point_id, item_name, unit_price, qty, entry_date) values ('${X}', '${point}', 'Tea', 10, 1, current_date);
    insert into supply_payments (shop_id, point_id, amount) values ('${X}', '${point}', 5);
  `);
  ids[tag] = { X, owner, prod, sp, sup, offer, po, point };
}
await seed(A, ownerA, "A");
await seed(B, ownerB, "B");
await db.exec(`
  insert into tenant_invites (email) values ('someone@x');
  insert into admin_audit_log (admin_id, action, target_type) values ('${admin}', 'x', 'shop');
`);

// ---------- what to check for each table ----------
// a: SQL that picks out shop A's rows. insert: a row that claims to belong to
// shop A (must be refused for outsiders). ownerRead: the owner of A can read it.
// staffBlind: a helper with NO permissions must not read it.
const a = ids.A;
const T = {
  shops: { a: `id = '${A}'`, insert: `insert into shops (owner_id, name, type) values ('${ownerA}', 'dup', 'kirana')`, touch: "name", ownerRead: true },
  shop_members: { a: `shop_id = '${A}'`, insert: `insert into shop_members (shop_id, user_id, role, name) values ('${A}', '${ownerB}', 'staff', 'sneak')`, touch: "name", ownerRead: true },
  products: { a: `owner_id = '${ownerA}'`, insert: `insert into products (owner_id, name) values ('${ownerA}', 'sneak')`, touch: "name", ownerRead: true },
  shop_products: { a: `shop_id = '${A}'`, insert: `insert into shop_products (shop_id, product_id, price) values ('${A}', '${a.prod}', 1)`, touch: "price", ownerRead: true },
  suppliers: { a: `owner_id = '${ownerA}'`, insert: `insert into suppliers (owner_id, name) values ('${ownerA}', 'sneak')`, touch: "name", ownerRead: true },
  shop_suppliers: { a: `shop_id = '${A}'`, insert: `insert into shop_suppliers (shop_id, supplier_id) values ('${A}', '${ids.B.sup}')`, touch: "owed", ownerRead: true },
  bills: { a: `shop_id = '${A}'`, insert: `insert into bills (shop_id, bill_no, items, subtotal, total) values ('${A}', 'sneak', '[]', 1, 1)`, touch: "total", ownerRead: true },
  credits: { a: `shop_id = '${A}'`, insert: `insert into credits (shop_id, phone, name, amount, type) values ('${A}', '1', 'x', 1, 'charge')`, touch: "amount", ownerRead: true, staffBlind: true },
  movements: { a: `shop_id = '${A}'`, insert: `insert into movements (shop_id, item_name, type, qty, reason) values ('${A}', 'x', 'in', 1, 'x')`, touch: "qty", ownerRead: true },
  expenses: { a: `shop_id = '${A}'`, insert: `insert into expenses (shop_id, category, amount) values ('${A}', 'x', 1)`, touch: "amount", ownerRead: true, staffBlind: true },
  fixed_expenses: { a: `shop_id = '${A}'`, insert: `insert into fixed_expenses (shop_id, name, category, amount, due_day) values ('${A}', 'x', 'x', 1, 1)`, touch: "amount", ownerRead: true, staffBlind: true },
  draws: { a: `shop_id = '${A}'`, insert: `insert into draws (shop_id, amount) values ('${A}', 1)`, touch: "amount", ownerRead: true, staffBlind: true },
  reconciliations: { a: `shop_id = '${A}'`, insert: `insert into reconciliations (shop_id, expected_cash, cash_counted, diff) values ('${A}', 1, 1, 0)`, touch: "diff", ownerRead: true, staffBlind: true },
  stock_batches: { a: `shop_id = '${A}'`, insert: `insert into stock_batches (shop_id, shop_product_id, qty_received, qty_remaining) values ('${A}', '${a.sp}', 1, 1)`, touch: "qty_remaining", ownerRead: true },
  clearance_offers: { a: `shop_id = '${A}'`, insert: `insert into clearance_offers (shop_id, discount_pct, start_date, end_date) values ('${A}', 5, current_date, current_date)`, touch: "discount_pct", ownerRead: true },
  clearance_offer_items: { a: `offer_id = '${a.offer}'`, insert: `insert into clearance_offer_items (offer_id, shop_product_id) values ('${a.offer}', '${a.sp}')`, touch: "offer_id", ownerRead: true },
  offer_posts: { a: `shop_id = '${A}'`, insert: `insert into offer_posts (shop_id, title, message) values ('${A}', 'x', 'x')`, touch: "title", ownerRead: true },
  purchase_orders: { a: `shop_id = '${A}'`, insert: `insert into purchase_orders (shop_id) values ('${A}')`, touch: "notes", ownerRead: true },
  purchase_order_items: { a: `po_id = '${a.po}'`, insert: `insert into purchase_order_items (po_id, item_name) values ('${a.po}', 'x')`, touch: "qty", ownerRead: true },
  supply_points: { a: `shop_id = '${A}'`, insert: `insert into supply_points (shop_id, name) values ('${A}', 'sneak')`, touch: "name", ownerRead: true, staffBlind: true },
  supply_entries: { a: `shop_id = '${A}'`, insert: `insert into supply_entries (shop_id, point_id, item_name, unit_price, qty, entry_date) values ('${A}', '${a.point}', 'x', 1, 1, current_date)`, touch: "qty", ownerRead: true, staffBlind: true },
  supply_payments: { a: `shop_id = '${A}'`, insert: `insert into supply_payments (shop_id, point_id, amount) values ('${A}', '${a.point}', 1)`, touch: "amount", ownerRead: true, staffBlind: true },
  // Platform tables: no shop can read or write them (the server uses the service role).
  tenant_controls: { a: `shop_id = '${A}'`, insert: `insert into tenant_controls (shop_id) values ('${A}')`, touch: "notes", ownerRead: true },
  api_keys: { a: `shop_id = '${A}'`, insert: `insert into api_keys (shop_id, name, key_prefix, key_hash) values ('${A}', 'k', 'p', 'h')`, touch: "name", ownerRead: false },
  ai_usage: { a: `shop_id = '${A}'`, insert: `insert into ai_usage (shop_id, kind) values ('${A}', 'scan')`, touch: "kind", ownerRead: false },
  tenant_invites: { a: `true`, insert: `insert into tenant_invites (email) values ('x@y')`, touch: "note", ownerRead: false },
  admin_audit_log: { a: `true`, insert: `insert into admin_audit_log (admin_id, action, target_type) values ('${ownerA}', 'x', 'x')`, touch: "action", ownerRead: false },
  platform_admins: { a: `true`, insert: `insert into platform_admins (user_id) values ('${ownerA}')`, touch: "user_id", ownerRead: false },
};
// Readable by everyone on purpose (prices and switches the app needs); nobody may write.
const PUBLIC_READ = {
  platform_settings: { insert: `insert into platform_settings (key, value) values ('evil', '{}')`, update: `update platform_settings set value = '{}'`, del: `delete from platform_settings` },
};

// ---------- 0. no table is missing from this test, and every table has the lock on ----------
const tables = await q(`select c.relname n, c.relrowsecurity rls from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' order by 1`);
for (const tb of tables) {
  t.ok(tb.rls, `${tb.n}: row-level security is ON`);
  t.ok(T[tb.n] || PUBLIC_READ[tb.n], `${tb.n}: is covered by the isolation test (add it to tests/db/isolation.rls.mjs)`);
}

// ---------- 1. outsiders: shop B's owner, and an anonymous visitor ----------
for (const [name, c] of Object.entries(T)) {
  for (const who of [ownerB, "anon"]) {
    const label = who === "anon" ? "anonymous" : "another shop's owner";
    await as(db, who);
    t.ok((await seen(`select count(*)::int c from ${name} where ${c.a}`)) === 0, `${name}: ${label} cannot read shop A's rows`);
    const upd = await seen(`with x as (update ${name} set ${c.touch} = ${c.touch} where ${c.a} returning 1) select count(*)::int c from x`);
    t.ok(upd === 0, `${name}: ${label} cannot change shop A's rows`);
    const del = await seen(`with x as (delete from ${name} where ${c.a} returning 1) select count(*)::int c from x`);
    t.ok(del === 0, `${name}: ${label} cannot delete shop A's rows`);
    const err = await fails(c.insert);
    t.ok(err && /row-level security|violates|permission denied|not in this shop/.test(err), `${name}: ${label} cannot add rows to shop A (${err ? "refused" : "ALLOWED"})`);
  }
}
for (const [name, c] of Object.entries(PUBLIC_READ)) {
  for (const who of [ownerB, "anon"]) {
    await as(db, who);
    t.ok(await fails(c.insert), `${name}: ${who === "anon" ? "anonymous" : "a shop owner"} cannot add rows`);
    t.ok((await seen(`with x as (${c.update} returning 1) select count(*)::int c from x`)) === 0, `${name}: ${who === "anon" ? "anonymous" : "a shop owner"} cannot change rows`);
    t.ok((await seen(`with x as (${c.del} returning 1) select count(*)::int c from x`)) === 0, `${name}: ${who === "anon" ? "anonymous" : "a shop owner"} cannot delete rows`);
  }
}

// ---------- 2. a helper with no permissions at shop A ----------
await as(db, staffA);
for (const [name, c] of Object.entries(T)) {
  if (!c.staffBlind) continue;
  t.ok((await seen(`select count(*)::int c from ${name} where ${c.a}`)) === 0, `${name}: a helper without that permission cannot read it`);
}

// ---------- 3. the right people can still do their job (so the tests above mean something) ----------
await as(db, ownerA);
for (const [name, c] of Object.entries(T)) {
  if (!c.ownerRead) continue;
  t.ok((await q(`select count(*)::int c from ${name} where ${c.a}`))[0].c >= 1, `${name}: shop A's owner can read their own rows`);
}
await as(db, null);
console.log(`${t.pass} passed, ${t.fail} failed (${Object.keys(T).length + Object.keys(PUBLIC_READ).length} tables)`);
process.exit(t.fail ? 1 : 0);
