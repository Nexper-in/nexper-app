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

export function summarizePeriod(bills = [], expenses = []) {
  let sales = 0, cash = 0, digital = 0, credit = 0;
  for (const b of bills) {
    const total = Number(b.total || 0);
    sales += total;
    if (b.payment_type === "credit") credit += total;
    else if ((b.payment_method || "cash") === "cash") cash += total;
    else digital += total;
  }
  const cat = new Map();
  let spent = 0;
  for (const e of expenses) {
    const a = Number(e.amount || 0);
    spent += a;
    cat.set(e.category || "Other", (cat.get(e.category || "Other") || 0) + a);
  }
  const byCategory = [...cat.entries()].map(([category, amount]) => ({ category, amount: money(amount) })).sort((a, b) => b.amount - a.amount);
  return { bills: bills.length, sales: money(sales), cash: money(cash), digital: money(digital), credit: money(credit), expenses: money(spent), byCategory, net: money(sales - spent) };
}

const r = (n) => `₹${money(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Plain text, good for WhatsApp and the email body.
export function periodText({ shopName, title, label, s }) {
  const lines = [`*${shopName}* – ${title}`, label, "", `Bills: ${s.bills}`, `Sales: ${r(s.sales)}`];
  if (s.cash || s.digital || s.credit) lines.push(`  Cash ${r(s.cash)} · UPI/card ${r(s.digital)} · Udhaar ${r(s.credit)}`);
  lines.push(`Expenses: ${r(s.expenses)}`);
  for (const c of s.byCategory) lines.push(`  ${c.category}: ${r(c.amount)}`);
  lines.push("", `Sales minus expenses: ${r(s.net)}`, "", "Sent from Nexper");
  return lines.join("\n");
}

export function periodCsv(label, s) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["Period", label], ["Bills", s.bills], ["Sales", s.sales], ["Cash", s.cash], ["UPI/card", s.digital], ["Udhaar", s.credit], ["Expenses", s.expenses]];
  for (const c of s.byCategory) rows.push([`Expense: ${c.category}`, c.amount]);
  rows.push(["Sales minus expenses", s.net]);
  return rows.map((x) => x.map(q).join(",")).join("\n");
}

export const PERIOD_TITLES = { day: "Daily report", week: "Weekly report", month: "Monthly report" };
