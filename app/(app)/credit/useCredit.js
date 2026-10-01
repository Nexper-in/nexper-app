"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useShop } from "@/components/ShopContext";
import { customerBalance } from "@/lib/dashboardHelpers";
import { useT } from "@/lib/i18n";

// Everything the Udhaar screen knows and does. The phone and laptop views
// (CreditMobile, CreditDesktop) only draw it; change behaviour here, and
// layout there.
export default function useCredit() {
  const { supabase, activeShopId, activeShop, showToast } = useShop();
  const t = useT();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [ledgerCustomer, setLedgerCustomer] = useState(null);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const { data } = await supabase.from("credits").select("*").eq("shop_id", activeShopId).order("date");
    setCredits(data || []);
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
    addEntry,
  };
}
