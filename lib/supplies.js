// Pure helpers for the Supplies screen (a shop that supplies tea, snacks or
// meals to regular places such as hospital departments). No network or React
// in here so it can be unit tested.

const pad = (n) => String(n).padStart(2, "0");

// Dates are plain "YYYY-MM-DD" strings in the shop's local day. Working with
// strings (not Date objects) avoids time-zone surprises around midnight.
export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayISO(now = new Date()) {
  return toISO(now);
}
export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// A named period for statements. `kind` is one of today | week | month |
// lastMonth. Weeks start on Monday.
export function rangeFor(kind, today) {
  const d = parseISO(today);
  if (kind === "today") return { from: today, to: today };
  if (kind === "week") {
    const back = (d.getDay() + 6) % 7;
    return { from: addDays(today, -back), to: today };
  }
  if (kind === "month") return { from: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
  if (kind === "lastMonth") {
    return {
      from: toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
      to: toISO(new Date(d.getFullYear(), d.getMonth(), 0)),
    };
  }
  return { from: today, to: today };
}

// Money in whole paise so repeated additions never drift (0.1 + 0.2).
const paise = (n) => Math.round(Number(n || 0) * 100);
const fromPaise = (p) => p / 100;
export const lineAmount = (qty, price) => fromPaise(Math.round(Number(qty || 0) * paise(price)));

export const cellKey = (pointId, itemId) => `${pointId}|${itemId}`;

// entries -> { "<point>|<item>": qty } for one day.
export function qtyMapFromEntries(entries) {
  const map = {};
  for (const e of entries || []) {
    if (!e.shop_product_id) continue;
    const k = cellKey(e.point_id, e.shop_product_id);
    map[k] = (map[k] || 0) + Number(e.qty || 0);
  }
  return map;
}

// Only the cells that differ from what is saved: [{ point_id, shop_product_id, qty }].
// A cell that went from something to nothing is sent as qty 0 (removes it).
export function diffRound(saved, edited) {
  const keys = new Set([...Object.keys(saved || {}), ...Object.keys(edited || {})]);
  const rows = [];
  for (const k of keys) {
    const before = Number(saved?.[k] || 0);
    const after = Number(edited?.[k] || 0);
    if (before === after) continue;
    const [point_id, shop_product_id] = k.split("|");
    rows.push({ point_id, shop_product_id, qty: after });
  }
  return rows;
}

// Totals for the day being edited: count per item and the amount, using each
// item's current price (what a new entry would be saved at).
export function roundTotals(items, qtyMap) {
  const byItem = {};
  for (const it of items) byItem[it.id] = { id: it.id, name: it.name, qty: 0, amount: 0 };
  let amount = 0;
  for (const [k, q] of Object.entries(qtyMap || {})) {
    const itemId = k.split("|")[1];
    const it = items.find((x) => x.id === itemId);
    if (!it || !q) continue;
    byItem[itemId].qty += q;
    byItem[itemId].amount = fromPaise(paise(byItem[itemId].amount) + paise(lineAmount(q, it.price)));
    amount = fromPaise(paise(amount) + paise(lineAmount(q, it.price)));
  }
  const lines = Object.values(byItem).filter((l) => l.qty > 0);
  return { lines, qty: lines.reduce((s, l) => s + l.qty, 0), amount };
}

// A statement for one department over [from, to] (inclusive).
//   entries   supply_entries rows for that department in the period
//   payments  supply_payments rows in the period
//   opening   what was owed before `from` (charges minus payments)
export function buildStatement({ entries = [], payments = [], opening = 0, from, to }) {
  const inRange = (d) => d >= from && d <= to;
  const days = new Map();
  const items = new Map();
  let charged = 0;
  for (const e of entries) {
    if (!inRange(e.entry_date)) continue;
    const amount = lineAmount(e.qty, e.unit_price);
    charged += paise(amount);
    const day = days.get(e.entry_date) || { date: e.entry_date, lines: [], amount: 0 };
    day.lines.push({ name: e.item_name, qty: Number(e.qty), price: Number(e.unit_price), amount });
    day.amount = fromPaise(paise(day.amount) + paise(amount));
    days.set(e.entry_date, day);
    const it = items.get(e.item_name) || { name: e.item_name, qty: 0, amount: 0 };
    it.qty += Number(e.qty);
    it.amount = fromPaise(paise(it.amount) + paise(amount));
    items.set(e.item_name, it);
  }
  const paidList = payments.filter((p) => inRange(p.paid_on)).sort((a, b) => (a.paid_on < b.paid_on ? -1 : 1));
  const paid = paidList.reduce((s, p) => s + paise(p.amount), 0);
  const dayList = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of dayList) d.lines.sort((a, b) => a.name.localeCompare(b.name));
  return {
    from,
    to,
    opening: Number(opening || 0),
    charged: fromPaise(charged),
    paid: fromPaise(paid),
    closing: fromPaise(paise(opening) + charged - paid),
    days: dayList,
    items: [...items.values()].sort((a, b) => b.amount - a.amount),
    payments: paidList,
  };
}

// Joins the department list with the all-time totals from supply_balances().
export function withBalances(points, balances) {
  const byPoint = new Map((balances || []).map((b) => [b.point_id, b]));
  return points.map((p) => {
    const b = byPoint.get(p.id);
    const charged = Number(b?.charged || 0);
    const paid = Number(b?.paid || 0);
    return { ...p, charged, paid, balance: fromPaise(paise(charged) - paise(paid)), lastDate: b?.last_date || null };
  });
}

const rs = (n) => `Rs ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const shortDate = (iso) => parseISO(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

// Plain text for WhatsApp / copy. English on purpose, like the other messages.
export function statementText({ shopName, pointName, statement }) {
  const s = statement;
  const lines = [];
  lines.push(`${shopName}: statement for ${pointName}`);
  lines.push(s.from === s.to ? shortDate(s.from) : `${shortDate(s.from)} to ${shortDate(s.to)}`);
  lines.push("");
  for (const it of s.items) lines.push(`${it.name}: ${it.qty} = ${rs(it.amount)}`);
  if (s.items.length) lines.push("");
  if (s.opening) lines.push(`Earlier balance: ${rs(s.opening)}`);
  lines.push(`Supplied: ${rs(s.charged)}`);
  if (s.paid) lines.push(`Paid: ${rs(s.paid)}`);
  lines.push(`Balance due: ${rs(s.closing)}`);
  return lines.join("\n");
}
