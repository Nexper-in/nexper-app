// Daily / weekly / monthly sales-and-expenses report. Pure functions, used by
// the Reports screen (preview + WhatsApp text) and the email API route.
// All days are Indian days (IST, UTC+5:30), whatever the server's clock says.

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

// "YYYY-MM-DD" for an instant, as seen in India.
export function istDateString(date = new Date()) {
  return new Date(date.getTime() + IST_MS).toISOString().slice(0, 10);
}

function istMidnight(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - IST_MS;
}

export function isYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

// period: "day" | "week" (Mon–Sun) | "month". Returns [start, end) as ISO strings.
export function periodRange(period, ymd) {
  const day = istMidnight(ymd);
  let start = day;
  let end = day + DAY_MS;
  if (period === "week") {
    const dow = (new Date(day + IST_MS).getUTCDay() + 6) % 7; // Mon = 0
    start = day - dow * DAY_MS;
    end = start + 7 * DAY_MS;
  } else if (period === "month") {
    const [y, m] = ymd.split("-").map(Number);
    start = Date.UTC(y, m - 1, 1) - IST_MS;
    end = Date.UTC(y, m, 1) - IST_MS;
  }
  const fmt = (ms, opts) => new Date(ms + IST_MS).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });
  let label;
  if (period === "day") label = fmt(start, { day: "numeric", month: "short", year: "numeric" });
  else if (period === "week") label = `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end - DAY_MS, { day: "numeric", month: "short", year: "numeric" })}`;
  else label = fmt(start, { month: "long", year: "numeric" });
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), label };
}

const money = (n) => Math.round(Number(n || 0) * 100) / 100;

export function summarizePeriod(bills = [], expenses = [], returns = []) {
  let sales = 0, cash = 0, digital = 0, credit = 0, refunds = 0;
  const items = new Map();
  for (const b of bills) {
    for (const it of b.items || []) {
      const key = String(it.name || "").trim();
      if (!key) continue;
      const cur = items.get(key) || { name: key, qty: 0, amount: 0 };
      cur.qty += Number(it.qty || 0);
      cur.amount += Number(it.qty || 0) * Number(it.price || 0);
      items.set(key, cur);
    }
    const total = Number(b.total || 0);
    sales += total;
    if (b.payment_type === "credit") credit += total;
    else if ((b.payment_method || "cash") === "cash") cash += total;
    else digital += total;
  }
  // Returns come off sales, off the way the customer paid, and off top sellers.
  for (const rt of returns) {
    const a = Number(rt.refund_amount || 0);
    refunds += a;
    sales -= a;
    if (rt.refund_method === "credit") credit -= a;
    else if (rt.refund_method === "cash") cash -= a;
    else digital -= a;
    for (const it of rt.items || []) {
      const cur = items.get(String(it.name || "").trim());
      if (cur) {
        cur.qty -= Number(it.qty || 0);
        cur.amount -= Number(it.amount || 0);
      }
    }
  }
  const cat = new Map();
  let spent = 0;
  for (const e of expenses) {
    const a = Number(e.amount || 0);
    spent += a;
    cat.set(e.category || "Other", (cat.get(e.category || "Other") || 0) + a);
  }
  const byCategory = [...cat.entries()].map(([category, amount]) => ({ category, amount: money(amount) })).sort((a, b) => b.amount - a.amount);
  const topItems = [...items.values()].filter((i) => i.qty > 0).map((i) => ({ ...i, qty: Math.round(i.qty * 100) / 100, amount: money(i.amount) })).sort((a, b) => b.amount - a.amount).slice(0, 3);
  return { topItems, bills: bills.length, returns: money(refunds), sales: money(sales), cash: money(cash), digital: money(digital), credit: money(credit), expenses: money(spent), byCategory, net: money(sales - spent) };
}

const r = (n) => `₹${money(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const BAR = "━━━━━━━━━━━━━━";

// Anchor date of the period just before this one (same length).
export function previousAnchor(period, ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (period === "month") return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  return new Date(Date.UTC(y, m - 1, d) - (period === "week" ? 7 : 1) * DAY_MS).toISOString().slice(0, 10);
}

const VS = { day: "yesterday", week: "last week", month: "last month" };

// WhatsApp-style text (*bold*, _italic_). Also used for the email body.
export function periodText({ shopName, title, label, s, prev, period }) {
  const L = [`📊 *${shopName}*`, `*${title}* · ${label}`, BAR, ""];
  L.push(`💰 *Sales  ${r(s.sales)}*`);
  const avg = s.bills ? ` · avg ${r(Math.round(s.sales / s.bills))}` : "";
  L.push(`🧾 ${s.bills} ${s.bills === 1 ? "bill" : "bills"}${avg}`);
  if (prev && prev.sales > 0 && VS[period]) {
    const pct = Math.round(((s.sales - prev.sales) / prev.sales) * 100);
    L.push(`${pct >= 0 ? "📈 ▲" : "📉 ▼"} ${Math.abs(pct)}% vs ${VS[period]} (${r(prev.sales)})`);
  }
  const pay = [["💵 Cash", s.cash], ["📱 UPI / card", s.digital], ["📒 Udhaar (to collect)", s.credit]].filter(([, v]) => v > 0);
  if (pay.length) {
    L.push("", "*How you were paid*");
    for (const [k, v] of pay) L.push(`${k}  ${r(v)}`);
  }
  if (s.topItems?.length) {
    L.push("", "🏆 *Top sellers*");
    s.topItems.forEach((i, n) => L.push(`${n + 1}. ${i.name} · ${i.qty} sold · ${r(i.amount)}`));
  }
  if (s.returns > 0) L.push(`↩️ Returns  ${r(s.returns)} (already taken off sales)`);
  L.push("", s.expenses > 0 ? `💸 *Expenses  ${r(s.expenses)}*` : "💸 *Expenses*  none recorded");
  for (const c of s.byCategory) L.push(`• ${c.category}  ${r(c.amount)}`);
  L.push("", BAR, `${s.net >= 0 ? "✅" : "⚠️"} *Net  ${r(s.net)}*`, "_Sales minus expenses_", "", "_Sent via Nexper_");
  return L.join("\n");
}

// Loads one period (and the one before it) with any Supabase client.
export async function fetchPeriodSummary(client, shopId, period, date) {
  const range = periodRange(period, date);
  const prevRange = periodRange(period, previousAnchor(period, date));
  const billSel = "items, total, payment_type, payment_method";
  const [b, e, pb, rt, prt] = await Promise.all([
    client.from("bills").select(billSel).eq("shop_id", shopId).gte("date", range.start).lt("date", range.end),
    client.from("expenses").select("amount, category").eq("shop_id", shopId).gte("date", range.start).lt("date", range.end),
    client.from("bills").select("total").eq("shop_id", shopId).gte("date", prevRange.start).lt("date", prevRange.end),
    client.from("sale_returns").select("items, refund_amount, refund_method").eq("shop_id", shopId).gte("date", range.start).lt("date", range.end),
    client.from("sale_returns").select("refund_amount, refund_method, items").eq("shop_id", shopId).gte("date", prevRange.start).lt("date", prevRange.end),
  ]);
  // A shop that has not run migration 031 yet has no sale_returns table; the
  // report must still work, so a missing table counts as "no returns".
  return {
    range,
    error: b.error || e.error || pb.error || null,
    s: summarizePeriod(b.data || [], e.data || [], rt.error ? [] : rt.data || []),
    prev: summarizePeriod(pb.data || [], [], prt.error ? [] : prt.data || []),
  };
}

export function periodCsv(label, s) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["Period", label], ["Bills", s.bills], ["Sales", s.sales], ["Cash", s.cash], ["UPI/card", s.digital], ["Udhaar", s.credit], ["Returns", s.returns || 0], ["Expenses", s.expenses]];
  for (const c of s.byCategory) rows.push([`Expense: ${c.category}`, c.amount]);
  for (const i of s.topItems || []) rows.push([`Top item: ${i.name}`, i.amount]);
  rows.push(["Sales minus expenses", s.net]);
  return rows.map((x) => x.map(q).join(",")).join("\n");
}

export const PERIOD_TITLES = { day: "Daily report", week: "Weekly report", month: "Monthly report" };
