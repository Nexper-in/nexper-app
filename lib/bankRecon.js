// Match UPI / card / bank sales in Nexper against a bank statement the owner
// uploads (CSV). Everything runs in the browser; the statement is never stored
// or sent anywhere.
import { parseCsv } from "@/lib/csv";

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "YYYY-MM-DD" in India for an instant.
export const istYmd = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
const dayNum = (ymd) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);

// 05/10/2026, 5-10-26, 05 Oct 2026, 05-Oct-2026, 2026-10-05. Day first (Indian banks).
export function parseStatementDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  else if ((m = t.match(/^(\d{1,2})[\/\-.\s]([A-Za-z]{3})[A-Za-z]*[\/\-.\s](\d{2,4})/))) [d, mo, y] = [+m[1], MONTHS[m[2].toLowerCase()], +m[3]];
  else if ((m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) [d, mo, y] = [+m[1], +m[2] - 1, +m[3]];
  else return null;
  if (mo == null || Number.isNaN(mo) || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  if (y < 100) y += 2000;
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseAmount(s) {
  let t = String(s ?? "").trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || /dr\s*$/i.test(t) || /^-/.test(t);
  t = t.replace(/[₹,\s]|rs\.?|inr|cr|dr|[()]|^-/gi, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return neg ? -n : n;
}

// Finds the header row and guesses which column is which. The owner can
// override every guess on screen, so a wrong guess costs one tap.
export function detectColumns(rows) {
  let h = rows.findIndex((r, i) => i < 20 && r.some((c) => /date/i.test(c)) && r.filter((c) => c).length >= 3);
  if (h < 0) h = 0;
  const head = rows[h] || [];
  const find = (...res) => head.findIndex((c) => res.some((re) => re.test(c)));
  const date = find(/txn.*date|transaction.*date|value.*date/i, /^date$/i, /date/i);
  const desc = find(/narration|description|particulars|remarks|details/i);
  const credit = find(/credit|deposit|\bcr\b/i);
  const debit = find(/debit|withdraw|\bdr\b/i);
  const amount = credit >= 0 ? -1 : find(/^amount/i, /amount/i);
  const type = find(/dr.?\/?.?cr|cr.?\/?.?dr|^type$/i);
  return { headerRow: h, date, desc, credit, debit, amount, type };
}

// Money received, from the chosen columns. Debits are ignored.
export function extractCredits(rows, cols) {
  const out = [];
  for (let i = cols.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseStatementDate(r[cols.date]);
    if (!date) continue;
    let amt = null;
    if (cols.credit >= 0) {
      const c = parseAmount(r[cols.credit]);
      amt = c != null && c > 0 ? c : null;
    } else if (cols.amount >= 0) {
      const a = parseAmount(r[cols.amount]);
      const t = cols.type >= 0 ? String(r[cols.type] || "") : "";
      if (a != null) amt = /cr/i.test(t) && !/dr/i.test(t) ? Math.abs(a) : cols.type >= 0 ? null : a > 0 ? a : null;
    }
    if (amt == null || !(amt > 0)) continue;
    out.push({ id: `c${i}`, date, amount: Math.round(amt * 100) / 100, desc: cols.desc >= 0 ? r[cols.desc] || "" : "" });
  }
  return out;
}

export const readStatement = (text) => {
  const rows = parseCsv(text);
  const cols = detectColumns(rows);
  return { rows, cols, credits: extractCredits(rows, cols) };
};

// sales: [{ id, date, amount, label }]  credits: [{ id, date, amount, desc }]
// A bank credit matches a sale of the same amount on the same day or up to
// `windowDays` after (weekends and settlement delay). Second pass: a single
// credit that equals one day's remaining sales added together (apps that pay out
// once a day).
export function matchCredits(sales, credits, { windowDays = 3 } = {}) {
  const cents = (n) => Math.round(n * 100);
  const sortedSales = [...sales].map((s) => ({ ...s, ymd: s.ymd || istYmd(s.date) })).sort((a, b) => a.ymd.localeCompare(b.ymd));
  const pool = [...credits].sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set();
  const matched = [];
  const left = [];

  for (const s of sortedSales) {
    const hit = pool.find((c) => !used.has(c.id) && cents(c.amount) === cents(s.amount) && dayNum(c.date) - dayNum(s.ymd) >= 0 && dayNum(c.date) - dayNum(s.ymd) <= windowDays);
    if (hit) { used.add(hit.id); matched.push({ type: "one", sales: [s], credit: hit }); }
    else left.push(s);
  }

  const byDay = new Map();
  for (const s of left) byDay.set(s.ymd, [...(byDay.get(s.ymd) || []), s]);
  const stillLeft = [];
  for (const [ymd, group] of byDay) {
    const total = group.reduce((a, s) => a + cents(s.amount), 0);
    const hit = group.length > 1 ? pool.find((c) => !used.has(c.id) && cents(c.amount) === total && dayNum(c.date) - dayNum(ymd) >= 0 && dayNum(c.date) - dayNum(ymd) <= windowDays) : null;
    if (hit) { used.add(hit.id); matched.push({ type: "daily", sales: group, credit: hit }); }
    else stillLeft.push(...group);
  }

  const sum = (arr) => Math.round(arr.reduce((a, x) => a + cents(x.amount), 0)) / 100;
  const unmatchedCredits = pool.filter((c) => !used.has(c.id));
  return {
    matched,
    unmatchedSales: stillLeft,
    unmatchedCredits,
    totals: {
      sales: sum(sales), matched: sum(matched.flatMap((m) => m.sales)),
      missing: sum(stillLeft), extra: sum(unmatchedCredits),
    },
  };
}
