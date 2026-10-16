import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { buildNightly, sendEmail } from "@/lib/notify";
import { sendTemplate, whatsappReady } from "@/lib/whatsappCloud";
import { creditReminderText } from "@/lib/messaging";
import { istDateString } from "@/lib/periodReport";

// Runs once a night (vercel.json, 21:30 India time; once a day is all the Vercel Hobby plan allows). For every shop that
// turned it on:
//   - emails the owner the day's summary (and sends it on WhatsApp if the
//     WhatsApp Cloud API is set up and a number is saved),
//   - sends udhaar reminders by WhatsApp only when the Cloud API is set up;
//     otherwise the owner sees "N customers are due" in the summary and in
//     the Udhaar screen, and sends them with one tap.
// Protected by CRON_SECRET: Vercel sends it as a Bearer token. Without the
// secret set, the route refuses to run.

export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const admin = createAdminClient();
  const today = istDateString();
  // Shops that still need today's summary are taken in batches of 100, one after another, until all
  // are done or the time budget is used (the function may run for 60 seconds). Each shop is marked
  // when done, so a run cut short by the budget is finished by the next night's run. Paging is by
  // shop id, so a shop that fails is skipped (and retried next night) instead of blocking the rest.
  // Closed shops are skipped. Before database update 043 this falls back to the old single pass.
  const BATCH = 100;
  const BUDGET_MS = 45000;
  const started = Date.now();
  const COLS = "id, name, owner_id, notify_phone, summary_enabled, reminders_enabled, reminder_every_days, reminder_min_amount";
  const out = { shops: 0, batched: true, summaries: 0, reminders: 0, failed: 0, complete: true };

  async function sendFor(shop, batched) {
    try {
      const night = await buildNightly(admin, shop);
      const { data: owner } = await admin.auth.admin.getUserById(shop.owner_id);
      const email = owner?.user?.email;

      if (shop.summary_enabled || (shop.reminders_enabled && night.dueCount > 0)) {
        const text = shop.summary_enabled ? night.text : `${shop.name}: ${night.dueCount} ${night.dueCount === 1 ? "customer is" : "customers are"} due an udhaar reminder. Open Udhaar in Nexper to send them.`;
        if (email) await sendEmail(email, `${shop.name} – ${shop.summary_enabled ? "today's summary" : "udhaar reminders due"}`, text);
        if (shop.summary_enabled && shop.notify_phone && whatsappReady()) await sendTemplate(shop.notify_phone, process.env.WHATSAPP_TEMPLATE_SUMMARY, [text]);
        out.summaries += 1;
      }

      if (shop.reminders_enabled && whatsappReady() && process.env.WHATSAPP_TEMPLATE_REMINDER) {
        for (const c of night.due) {
          const r = await sendTemplate(c.phone, process.env.WHATSAPP_TEMPLATE_REMINDER, [shop.name, c.name || "there", String(c.balance)]);
          if (r.ok) {
            await admin.from("reminder_log").insert({ shop_id: shop.id, phone: c.phone, amount: c.balance, channel: "whatsapp_api" });
            out.reminders += 1;
          }
        }
      }
      if (batched) await admin.from("shops").update({ summary_sent_on: today }).eq("id", shop.id);
    } catch {
      out.failed += 1;
    }
  }

  let cursor = null;
  for (;;) {
    let q = admin
      .from("shops")
      .select(COLS)
      .or("summary_enabled.eq.true,reminders_enabled.eq.true")
      .or(`summary_sent_on.is.null,summary_sent_on.neq.${today}`)
      .neq("status", "closed")
      .order("id")
      .limit(BATCH);
    if (cursor) q = q.gt("id", cursor);
    const { data: shops, error } = await q;
    if (error) {
      if (cursor) return NextResponse.json({ error: "Could not load shops." }, { status: 500 });
      // Database update 043 is not applied yet: the old single pass over (at most) 500 shops.
      out.batched = false;
      const old = await admin.from("shops").select(COLS).or("summary_enabled.eq.true,reminders_enabled.eq.true").limit(500);
      if (old.error) return NextResponse.json({ error: "Could not load shops." }, { status: 500 });
      for (const shop of old.data) {
        out.shops += 1;
        await sendFor(shop, false);
      }
      break;
    }
    if (shops.length === 0) break;
    for (const shop of shops) {
      out.shops += 1;
      await sendFor(shop, true);
    }
    cursor = shops[shops.length - 1].id;
    if (shops.length < BATCH) break;
    if (Date.now() - started > BUDGET_MS) {
      out.complete = false; // more shops are waiting: tomorrow night's run continues
      break;
    }
  }
  return NextResponse.json(out);
}
