// Synthetic data for the STAGING database only. Never a copy of production.
// client: { rows(sql, params) } (see tools/migrate-core.mjs). The owner account must
// already exist (scripts/seed-staging.mjs creates it through the Supabase Admin API).
// Safe to run again: it adds nothing that is already there.
export const STAGING_DOMAIN = "@staging.nexper.in";

// Refuses to run on a database that holds anyone's real shop: every shop owner in a
// staging database must have an address on our staging domain.
export async function assertStagingSafe(client) {
  const bad = await client.rows(
    `select u.email from shops s join auth.users u on u.id = s.owner_id where u.email is null or u.email not like $1 limit 3`,
    ["%" + STAGING_DOMAIN]
  );
  if (bad.length) {
    throw new Error(`Refusing to seed: this database has shops owned by ${bad.map((b) => b.email).join(", ")}. Only ${STAGING_DOMAIN} accounts may exist in staging.`);
  }
}

const ITEMS = [
  ["Aashirvaad Atta 5kg", "Staples", 245, 225, 5],
  ["Amul Taaza Milk 1L", "Dairy", 54, 50, 5],
  ["Parle-G Biscuit 100g", "Snacks", 10, 8.5, 18],
  ["Tata Salt 1kg", "Staples", 28, 24, 0],
  ["Maggi Noodles 70g", "Snacks", 14, 12, 18],
  ["Amul Butter 100g", "Dairy", 58, 52, 12],
  ["Fortune Sunflower Oil 1L", "Staples", 155, 140, 5],
  ["Britannia Bread 400g", "Bakery", 40, 34, 0],
  ["Surf Excel 1kg", "Household", 138, 120, 18],
  ["Colgate 100g", "Personal care", 55, 47, 18],
  ["Tea Dust 250g", "Staples", 95, 82, 5],
  ["Sugar 1kg", "Staples", 46, 41, 0],
];

// Small deterministic generator so every run of the seed makes the same bills.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function one(client, sql, params) {
  return (await client.rows(sql, params))[0];
}

async function seedShop(client, ownerId, name, type, seed) {
  const existing = await one(client, `select id from shops where owner_id = $1 and name = $2`, [ownerId, name]);
  if (existing) return { id: existing.id, created: false };
  const shop = await one(client, `insert into shops (owner_id, name, type) values ($1, $2, $3) returning id`, [ownerId, name, type]);
  // The app adds the owner as a member right after creating a shop; do the same.
  await client.rows(`insert into shop_members (shop_id, user_id, role, name, permissions) values ($1, $2, 'owner', 'Staging Owner', org_full_permissions())`, [shop.id, ownerId]);
  const sp = [];
  for (const [n, cat, price, cost, gst] of ITEMS) {
    let p = await one(client, `select id from products where owner_id = $1 and name = $2`, [ownerId, n]);
    if (!p) p = await one(client, `insert into products (owner_id, name, category, unit) values ($1, $2, $3, 'pcs') returning id`, [ownerId, n, cat]);
    const row = await one(
      client,
      `insert into shop_products (shop_id, product_id, price, cost_price, gst, stock, low_at, quick) values ($1, $2, $3, $4, $5, $6, 5, $7) returning id`,
      [shop.id, p.id, price, cost, gst, 20 + Math.floor(rng(seed + price)() * 60), sp.length < 6]
    );
    sp.push({ id: row.id, name: n, price, gst });
  }
  const rand = rng(seed);
  for (let i = 0; i < 40; i++) {
    const lines = [];
    const count = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < count; k++) {
      const it = sp[Math.floor(rand() * sp.length)];
      lines.push({ id: it.id, name: it.name, qty: 1 + Math.floor(rand() * 3), price: it.price, gst: it.gst, unit: "pcs" });
    }
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const kind = rand();
    const payment = kind < 0.5 ? "cash" : kind < 0.8 ? "upi" : "credit";
    const daysAgo = Math.floor(rand() * 20);
    const billNo = `KS-${1001 + i}`;
    await client.rows(
      `insert into bills (shop_id, bill_no, customer_name, customer_phone, items, subtotal, discount_amount, total, payment_type, payment_method, date)
       values ($1, $2, $3, $4, $5::jsonb, $6, 0, $6, $7, $8, now() - ($9 || ' days')::interval - ($10 || ' minutes')::interval)`,
      [shop.id, billNo, payment === "credit" ? "Test Customer " + (1 + (i % 3)) : null, payment === "credit" ? "90000000" + String(10 + (i % 3)) : null, JSON.stringify(lines), subtotal, payment === "credit" ? "credit" : "cash", payment === "credit" ? "cash" : payment, String(daysAgo), String(Math.floor(rand() * 600))]
    );
    if (payment === "credit") {
      await client.rows(`insert into credits (shop_id, phone, name, amount, type, note) values ($1, $2, $3, $4, 'charge', $5)`, [
        shop.id,
        "90000000" + String(10 + (i % 3)),
        "Test Customer " + (1 + (i % 3)),
        subtotal,
        "Bill " + billNo,
      ]);
    }
  }
  return { id: shop.id, created: true };
}

// ownerId: the staging owner's auth user id. Makes a 3-shop company with two shops filled in.
export async function seedStaging(client, ownerId) {
  await assertStagingSafe(client);
  const first = await seedShop(client, ownerId, "Staging General Store", "kirana", 11);
  // A chain needs more than one shop: raise the company's limit (the platform admin does this in /admin).
  // Acting as the server (the guard on organisations only lets the service role change the limit).
  await client.rows(`select set_config('request.jwt.claim.role', 'service_role', false)`);
  await client.rows(`update organisations set max_shops = greatest(max_shops, 3) where owner_id = $1`, [ownerId]);
  const second = await seedShop(client, ownerId, "Staging Gandhi Road", "kirana", 23);
  return { shops: [first, second] };
}
