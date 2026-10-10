// Nightly summary and udhaar reminders, built on the server. SERVER-ONLY:
// it takes a service-role client and reads across shops, so it must only be
// imported from app/api/** routes.
import { fetchPeriodSummary, periodText, istDateString, PERIOD_TITLES } from "@/lib/periodReport";
import { dueReminders } from "@/lib/reminders";
import { customerBalance } from "@/lib/dashboardHelpers";
import { rupee } from "@/lib/format";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Everything the owner reads at night: the day's report plus udhaar and low stock.
export async function buildNightly(admin, shop, date = istDateString()) {
  const { s, prev, range, error } = await fetchPeriodSummary(admin, shop.id, "day", date);
  if (error) throw new Error("Could not load the day's numbers");

  const [{ data: credits }, { data: log }, { data: stock }] = await Promise.all([
    admin.from("credits").select("phone, name, amount, type, date").eq("shop_id", shop.id),
    admin.from("reminder_log").select("phone, sent_at").eq("shop_id", shop.id),
    admin.from("shop_products").select("stock, low_at, product:products(name)").eq("shop_id", shop.id),
  ]);

  const phones = [...new Set((credits || []).map((c) => c.phone))];
  const owed = phones.reduce((a, p) => a + Math.max(0, customerBalance(credits || [], p)), 0);
  const due = dueReminders(credits || [], log || [], shop);
  const low = (stock || []).filter((r) => r.low_at != null && Number(r.stock) <= Number(r.low_at)).map((r) => r.product?.name).filter(Boolean);

  const lines = [periodText({ shopName: shop.name, title: PERIOD_TITLES.day, label: range.label, s, prev, period: "day" })];
  const extra = [];
  if (owed > 0) extra.push(`📒 Udhaar to collect: ${rupee(owed)}${due.length ? ` (${due.length} ${due.length === 1 ? "customer is" : "customers are"} due a reminder)` : ""}`);
  if (low.length) extra.push(`📦 Running low: ${low.slice(0, 6).join(", ")}${low.length > 6 ? ` +${low.length - 6} more` : ""}`);
  const text = extra.length ? `${lines[0]}\n\n${extra.join("\n")}` : lines[0];
  return { text, dueCount: due.length, due, owed, low };
}

export async function sendEmail(to, subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Email is not set up yet." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Nexper <onboarding@resend.dev>",
      to: [to],
      subject,
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text.replace(/[*_]/g, ""))}</pre><p style="color:#666">Sent only to you. Change this in Store settings.</p>`,
    }),
  });
  return { ok: res.ok };
}
