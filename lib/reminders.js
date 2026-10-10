import { customerBalance } from "@/lib/dashboardHelpers";

const DAY_MS = 86_400_000;

// Who is due an udhaar reminder right now.
//
// A customer is due when they owe at least `reminder_min_amount`, their newest
// charge is at least 2 days old (nobody is nagged about today's bill), and
// they have not been reminded in the last `reminder_every_days` days.
// Pure function: the Udhaar screen and the nightly job use the same rule.
//
// credits: rows of the credits table; log: rows of reminder_log;
// settings: the shop row (reminder_every_days, reminder_min_amount).
export function dueReminders(credits, log, settings, now = Date.now()) {
  const every = Number(settings?.reminder_every_days ?? 7);
  const min = Number(settings?.reminder_min_amount ?? 50);
  const lastReminded = new Map();
  for (const l of log || []) {
    const ts = new Date(l.sent_at).getTime();
    if (!lastReminded.has(l.phone) || ts > lastReminded.get(l.phone)) lastReminded.set(l.phone, ts);
  }
  const people = new Map();
  for (const c of credits || []) {
    const cur = people.get(c.phone) || { phone: c.phone, name: c.name, newestCharge: 0, oldestCharge: Infinity };
    cur.name = c.name || cur.name;
    if (c.type === "charge") {
      const ts = new Date(c.date).getTime();
      cur.newestCharge = Math.max(cur.newestCharge, ts);
      cur.oldestCharge = Math.min(cur.oldestCharge, ts);
    }
    people.set(c.phone, cur);
  }
  const due = [];
  for (const p of people.values()) {
    const balance = Math.round(customerBalance(credits, p.phone) * 100) / 100;
    if (balance <= 0 || balance < min) continue;
    if (now - p.newestCharge < 2 * DAY_MS) continue;
    const last = lastReminded.get(p.phone);
    if (last && now - last < every * DAY_MS) continue;
    due.push({
      phone: p.phone,
      name: p.name,
      balance,
      lastReminded: last || null,
      daysOwing: Number.isFinite(p.oldestCharge) ? Math.floor((now - p.oldestCharge) / DAY_MS) : null,
    });
  }
  return due.sort((a, b) => b.balance - a.balance);
}
