// Margin alerts and the dead-stock report. Pure functions over what the app
// already stores (items with cost_price, stock batches, bills), so they need
// no database change.

const DAY_MS = 86_400_000;
const money = (n) => Math.round(Number(n || 0) * 100) / 100;
const pct = (n) => Math.round(n * 10) / 10;

export const marginPct = (price, cost) => (Number(price) > 0 ? ((Number(price) - Number(cost)) / Number(price)) * 100 : 0);

// What the price must be to earn `targetPct` margin on `cost`, rounded up to a
// whole rupee and held at the MRP (nothing may be sold above MRP).
export function suggestedPrice(cost, targetPct, mrp) {
  const raw = Number(cost) / (1 - targetPct / 100);
  const up = Math.ceil(raw);
  if (mrp != null && Number(mrp) > 0 && up > Number(mrp)) return { price: Number(mrp), cappedAtMrp: true };
  return { price: up, cappedAtMrp: false };
}

// items: flattened shop items (id, name, unit, price, cost_price, mrp)
// batches: stock_batches rows (shop_product_id, cost_price, received_date, reason)
// Returns alerts, worst first:
//   loss   selling below what it cost
//   costUp the latest purchase cost more than the one before it
//   thin   margin under minMarginPct
export function marginAlerts(items, batches = [], { minMarginPct = 10, costRisePct = 3, targetPct = 15 } = {}) {
  const byItem = new Map();
  for (const b of batches) {
    if (b.reason === "Return" || !(Number(b.cost_price) > 0)) continue;
    byItem.set(b.shop_product_id, [...(byItem.get(b.shop_product_id) || []), b]);
  }
  const out = [];
  for (const it of items) {
    if (it.cost_price == null || !(Number(it.cost_price) > 0) || !(Number(it.price) > 0)) continue;
    const m = marginPct(it.price, it.cost_price);
    const base = { id: it.id, name: it.name, unit: it.unit, price: Number(it.price), cost: Number(it.cost_price), mrp: it.mrp ?? null, marginPct: pct(m) };
    const bs = (byItem.get(it.id) || []).sort((a, b) => new Date(b.received_date) - new Date(a.received_date));
    let costUp = null;
    if (bs.length >= 2) {
      const [now, before] = [Number(bs[0].cost_price), Number(bs[1].cost_price)];
      const rise = ((now - before) / before) * 100;
      if (rise >= costRisePct) costUp = { oldCost: before, newCost: now, risePct: pct(rise), newMarginPct: pct(marginPct(it.price, now)) };
    }
    if (m < 0) out.push({ ...base, kind: "loss", fix: suggestedPrice(it.cost_price, targetPct, it.mrp), costUp });
    else if (costUp) out.push({ ...base, kind: "costUp", fix: suggestedPrice(costUp.newCost, targetPct, it.mrp), costUp });
    else if (m < minMarginPct) out.push({ ...base, kind: "thin", fix: suggestedPrice(it.cost_price, targetPct, it.mrp), costUp: null });
  }
  const rank = { loss: 0, costUp: 1, thin: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.marginPct - b.marginPct);
}

// Items still on the shelf that have not sold for `days` days (or never).
// A new item gets the same grace period before it can count as dead stock.
// Value is what the stock cost you (or its selling price if no cost is on record).
export function deadStock(items, bills, { days = 30, now = Date.now() } = {}) {
  const last = new Map();
  for (const b of bills) {
    const ts = new Date(b.date).getTime();
    for (const l of b.items || []) {
      if (l.shop_product_id && (!last.has(l.shop_product_id) || ts > last.get(l.shop_product_id))) last.set(l.shop_product_id, ts);
    }
  }
  const out = [];
  for (const it of items) {
    if (!(Number(it.stock) > 0)) continue;
    const lastSold = last.get(it.id) ?? null;
    const added = it.created_at ? new Date(it.created_at).getTime() : null;
    const since = lastSold ?? added;
    if (since != null && now - since < days * DAY_MS) continue;
    const unitValue = it.cost_price != null && Number(it.cost_price) > 0 ? Number(it.cost_price) : Number(it.price || 0);
    out.push({
      id: it.id, name: it.name, unit: it.unit, stock: Number(it.stock), price: Number(it.price),
      lastSold, daysIdle: since != null ? Math.floor((now - since) / DAY_MS) : null,
      neverSold: lastSold == null, value: money(Number(it.stock) * unitValue), costKnown: it.cost_price != null && Number(it.cost_price) > 0,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}
