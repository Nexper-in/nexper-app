// Bulk price update: plan the change first (so the owner sees every old and
// new price), then apply it. Nothing here touches the database.

const round2 = (n) => Math.round(n * 100) / 100;

// mode: "percent" (+10 / -5) or "amount" (+2 / -1 rupees)
// roundTo: 0 = exact paise, 0.5, 1 or 5 = nearest rupee step
// Never goes above MRP when capMrp is on, and never below ₹0.50.
export function planPriceChange(items, { category = null, mode = "percent", value = 0, roundTo = 1, capMrp = true } = {}) {
  const v = Number(value);
  const rows = [];
  if (!Number.isFinite(v) || v === 0) return rows;
  for (const it of items) {
    if (category && it.category !== category) continue;
    const old = Number(it.price);
    if (!(old > 0)) continue;
    let next = mode === "percent" ? old * (1 + v / 100) : old + v;
    if (roundTo > 0) next = Math.round(next / roundTo) * roundTo;
    next = round2(next);
    let capped = false;
    if (capMrp && it.mrp != null && Number(it.mrp) > 0 && next > Number(it.mrp)) { next = Number(it.mrp); capped = true; }
    if (next < 0.5) continue;
    if (next === old) continue;
    rows.push({
      id: it.id, name: it.name, unit: it.unit, category: it.category, old, next, capped,
      belowCost: it.cost_price != null && Number(it.cost_price) > 0 && next < Number(it.cost_price),
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
