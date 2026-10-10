"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useShop } from "@/components/ShopContext";
import { customerBalance } from "@/lib/dashboardHelpers";
import { dueReminders } from "@/lib/reminders";
import { whatsappLink, creditReminderText } from "@/lib/messaging";
import { useT } from "@/lib/i18n";

// Everything the Udhaar screen knows and does. The phone and laptop views
// (CreditMobile, CreditDesktop) only draw it; change behaviour here, and
// layout there.
export default function useCredit() {
  const { supabase, activeShopId, activeShop, showToast } = useShop();
  const t = useT();
  const [credits, setCredits] = useState([]);
  const [reminderLog, setReminderLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [ledgerCustomer, setLedgerCustomer] = useState(null);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const [{ data }, { data: logData }] = await Promise.all([
      supabase.from("credits").select("*").eq("shop_id", activeShopId).order("date"),
      // Before migration 031 the table does not exist; that just means "nobody reminded yet".
      supabase.from("reminder_log").select("phone, sent_at").eq("shop_id", activeShopId),
    ]);
    setCredits(data || []);
    setReminderLog(logData || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const customers = useMemo(() => {
    const map = new Map();
    credits.forEach((c) => {
      if (!map.has(c.phone)) map.set(c.phone, { phone: c.phone, name: c.name });
    });
    return [...map.values()].map((c) => ({ ...c, balance: customerBalance(credits, c.phone) })).sort((a, b) => b.balance - a.balance);
  }, [credits]);

  const overdue = customers.filter((c) => c.balance > 0);
  const totalOutstanding = overdue.reduce((s, c) => s + c.balance, 0);

  // Customers the shop's reminder rule says are due today. Empty unless the
  // owner turned reminders on in Store settings.
  const due = useMemo(
    () => (activeShop?.reminders_enabled ? dueReminders(credits, reminderLog, activeShop) : []),
    [credits, reminderLog, activeShop]
  );

  // Opens WhatsApp with the message ready and notes that this customer was
  // reminded, so the same person is not nagged again for a while.
  function remind(c) {
    window.open(whatsappLink(c.phone, creditReminderText(activeShop?.name, c.name, c.balance)), "_blank", "noopener,noreferrer");
    const row = { shop_id: activeShopId, phone: c.phone, amount: c.balance, channel: "whatsapp_link" };
    setReminderLog((prev) => [...prev, { phone: c.phone, sent_at: new Date().toISOString() }]);
    supabase.from("reminder_log").insert(row).then(() => {});
  }

  async function addEntry(entry) {
    const { data, error } = await supabase
      .from("credits")
      .insert({ ...entry, shop_id: activeShopId })
      .select()
      .single();
    if (error) throw error;
    setCredits((prev) => [...prev, data]);
    setShowNew(false);
    setPayFor(null);
    showToast(entry.type === "charge" ? t("Credit sale recorded") : t("Payment recorded"));
  }

  return {
    supabase, activeShopId, activeShop,
    credits, loading, customers, overdue, totalOutstanding,
    showNew, setShowNew, payFor, setPayFor, ledgerCustomer, setLedgerCustomer,
    addEntry, due, remind,
  };
}
