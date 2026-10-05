import { NextResponse } from "next/server";
import { createAdminClient, getRequestUser } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { computeGstSummary, summaryToCsv } from "@/lib/gstReport";
import { isYmd, fetchPeriodSummary, periodText, periodCsv, PERIOD_TITLES } from "@/lib/periodReport";

// Emails the signed-in owner their own GST summary for one month.
// The recipient is ALWAYS the signed-in user's own address; it is never
// taken from the request. Documented exception to "no shop data to third
// parties" in SECURITY.md: the email provider (Resend) sees the report.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function POST(request) {
  const user = await getRequestUser(request);
  if (!user?.email) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (isRateLimited(`email-report:${user.id}`, { windowMs: 60_000 * 10, max: 5 })) {
    return NextResponse.json({ error: "Too many emails. Try again in a few minutes." }, { status: 429 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Email is not set up yet." }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const shopId = String(body.shopId || "");
  const kind = body.kind === "period" ? "period" : "gst";
  const period = String(body.period || "");
  const date = String(body.date || "");
  const month = String(body.month || "");
  if (!shopId || (kind === "gst" ? !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) : !(PERIOD_TITLES[period] && isYmd(date)))) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: member } = await admin.from("shop_members").select("shop_id").eq("user_id", user.id).eq("shop_id", shopId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const { data: shop } = await admin.from("shops").select("name").eq("id", shopId).maybeSingle();
  const shopName = shop?.name || "Your shop";
  let subject, html, attachment;

  if (kind === "gst") {
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const { data: bills, error } = await admin.from("bills").select("items, total, date").eq("shop_id", shopId).gte("date", start.toISOString()).lt("date", end.toISOString());
    if (error) return NextResponse.json({ error: "Could not load bills." }, { status: 500 });
    const csv = summaryToCsv(computeGstSummary(bills || []));
    const sales = (bills || []).reduce((a, b) => a + Number(b.total || 0), 0);
    const label = start.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    subject = `${shopName} – sales & GST report, ${label}`;
    html = `<p>Your Nexper report for <b>${esc(label)}</b> is attached.</p><p>Bills: ${(bills || []).length}<br>Total sales: ₹${sales.toFixed(2)}</p><p style="color:#666">Sent only to you, on your request.</p>`;
    attachment = { filename: `gst-summary-${month}.csv`, content: Buffer.from(csv).toString("base64") };
  } else {
    const { range, s, prev, error: perr } = await fetchPeriodSummary(admin, shopId, period, date);
    if (perr) return NextResponse.json({ error: "Could not load the report." }, { status: 500 });
    const label = range.label;
    const title = PERIOD_TITLES[period];
    subject = `${shopName} – ${title.toLowerCase()}, ${label}`;
    html = `<pre style="font-family:inherit;white-space:pre-wrap">${esc(periodText({ shopName, title, label, s, prev, period }).replace(/[*_]/g, ""))}</pre><p style="color:#666">Sent only to you, on your request. CSV attached.</p>`;
    attachment = { filename: `${period}-report-${date}.csv`, content: Buffer.from(periodCsv(label, s)).toString("base64") };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Nexper <onboarding@resend.dev>",
      to: [user.email],
      subject,
      html,
      attachments: [attachment],
    }),
  });
  if (!res.ok) return NextResponse.json({ error: "Email could not be sent." }, { status: 502 });
  return NextResponse.json({ ok: true, to: user.email });
}
