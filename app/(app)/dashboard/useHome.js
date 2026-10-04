"use client";

import { fetchAll, daysAgo } from "@/lib/fetchAll";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Wallet, CalendarClock, MessageCircle, PackagePlus, Calculator } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { customerBalance, topCustomers } from "@/lib/dashboardHelpers";
import { fetchShopItems } from "@/lib/products";
import { whatsappLink, creditReminderText } from "@/lib/messaging";
import { useT } from "@/lib/i18n";

// Everything Home knows about the shop today. The phone and laptop screens
// (HomeMobile / HomeDesktop) both read from this and only differ in layout.
export function useHome() {
  const { supabase, activeShopId, activeShop, user, isOwner } = useShop();
  const router = useRouter();
  const t = useT();
  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [movements, setMovements] = useState([]);
  const [credits, setCredits] = useState([]);
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null); // 'items' | 'value' | 'low' | 'profit'
  const [customerDetail, setCustomerDetail] = useState(null);
  const [showInsights, setShowInsights] = useState(false);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 14);
    const [itemsData, { data: billsData }, { data: movesData }, { data: creditsData }, { data: batchesData }] = await Promise.all([
      fetchShopItems(supabase, activeShopId, { orderByCode: false }),
      // Only the last 35 days: today, the week chart, 30-day categories and top
      // customers all fit inside it. (Loading every bill ever made would be slow
      // and the database stops at 1000 rows.)
      fetchAll(() => supabase.from("bills").select("*").eq("shop_id", activeShopId).gte("date", daysAgo(35)).order("date", { ascending: false }).order("id"), { max: 20000 }),
      supabase.from("movements").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }).limit(6),
      // Balances need every entry, so read them all, page by page.
      fetchAll(() => supabase.from("credits").select("*").eq("shop_id", activeShopId).order("date").order("id")),
      supabase
        .from("stock_batches")
        .select("*")
        .eq("shop_id", activeShopId)
        .gt("qty_remaining", 0)
        .not("expiry_date", "is", null)
        .lte("expiry_date", horizon.toISOString().slice(0, 10))
        .order("expiry_date", { ascending: true }),
    ]);
    setItems(itemsData);
    setBills(billsData || []);
    setMovements(movesData || []);
    setCredits(creditsData || []);
    setExpiringBatches(batchesData || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const lowItems = items.filter((i) => i.stock <= i.low_at);
  const lowStockCount = lowItems.length;
  const stockValue = items.reduce((s, i) => s + i.stock * i.price, 0);

  const todaysBills = useMemo(() => {
    const t = new Date().toDateString();
    return bills.filter((b) => new Date(b.date).toDateString() === t);
  }, [bills]);
  const todaysSales = todaysBills.reduce((s, b) => s + b.total, 0);
  const todaysProfit = useMemo(() => {
    return todaysBills.reduce((sum, b) => {
      const billProfit = (b.items || []).reduce((s, line) => {
        const current = items.find((i) => i.id === line.shop_product_id);
        // No purchase price on record — exclude rather than assume zero
        // cost, which would count the whole sale as profit.
        if (!current || current.cost_price == null) return s;
        return s + (line.price - current.cost_price) * line.qty;
      }, 0);
      return sum + billProfit;
    }, 0);
  }, [todaysBills, items]);

  const outstandingCredit = useMemo(() => {
    const phones = [...new Set(credits.map((c) => c.phone))];
    return phones.reduce((s, ph) => s + Math.max(0, customerBalance(credits, ph)), 0);
  }, [credits]);

  const bestCustomers = useMemo(() => {
    const cutoff = new Date(daysAgo(30));
    return topCustomers(bills.filter((b) => new Date(b.date) >= cutoff), 5);
  }, [bills]);

  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const total = bills.filter((b) => new Date(b.date).toDateString() === key).reduce((s, b) => s + b.total, 0);
      days.push({
        label: d.toLocaleDateString("en-IN", { weekday: "short" }),
        sublabel: d.toLocaleDateString("en-IN", { day: "numeric" }),
        value: total,
        isHighlight: i === 0,
      });
    }
    return days;
  }, [bills]);

  const categorySales = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const map = new Map();
    bills.filter((b) => new Date(b.date) >= cutoff).forEach((bill) => {
      (bill.items || []).forEach((line) => {
        const inv = items.find((i) => i.id === line.shop_product_id);
        const cat = inv?.category || "Other";
        map.set(cat, (map.get(cat) || 0) + line.price * line.qty);
      });
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [bills, items]);

  const expiringWithNames = useMemo(
    () =>
      expiringBatches.map((b) => {
        const item = items.find((i) => i.id === b.shop_product_id);
        const days = Math.ceil((new Date(b.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        return { ...b, itemName: item?.name || "Unknown item", unit: item?.unit || "", days };
      }),
    [expiringBatches, items]
  );

  // Today's takings split the way the counter thinks about it.
  const todaySplit = useMemo(() => {
    const split = { cash: 0, upi: 0, udhaar: 0 };
    todaysBills.forEach((b) => {
      if (b.payment_type === "credit") split.udhaar += b.total;
      else if (b.payment_method === "upi") split.upi += b.total;
      else split.cash += b.total;
    });
    return split;
  }, [todaysBills]);

  // Customers who owe money, biggest first, with days since their last entry.
  const dueCustomers = useMemo(() => {
    const byPhone = new Map();
    credits.forEach((c) => {
      const cur = byPhone.get(c.phone) || { phone: c.phone, name: c.name, last: 0 };
      cur.last = Math.max(cur.last, new Date(c.date).getTime());
      byPhone.set(c.phone, cur);
    });
    return [...byPhone.values()]
      .map((c) => ({ ...c, balance: customerBalance(credits, c.phone), days: Math.floor((Date.now() - c.last) / 86400000) }))
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [credits]);

  // One list of things that need the owner today, each with its fix.
  const attention = [
    ...[...lowItems]
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 2)
      .map((i) => ({
        key: `low-${i.id}`,
        icon: AlertTriangle,
        tone: i.stock === 0 ? "danger" : "warn",
        title: i.name,
        sub: i.stock === 0 ? t("Out of stock") : t("Only {n} {unit} left", { n: i.stock, unit: i.unit }),
        action: t("Add stock"),
        onClick: () => router.push(`/inventory?q=${encodeURIComponent(i.name)}`),
      })),
    ...expiringWithNames.slice(0, 1).map((b) => ({
      key: `exp-${b.id}`,
      icon: CalendarClock,
      tone: b.days <= 0 ? "danger" : "warn",
      title: b.itemName,
      sub: `${b.qty_remaining} ${b.unit} · ${b.days < 0 ? t("expired {n}d ago", { n: Math.abs(b.days) }) : b.days === 0 ? t("expires today") : t("expires in {n}d", { n: b.days })}`,
      action: isOwner ? t("Offer") : null,
      onClick: () => router.push(`/clearance?items=${b.shop_product_id}`),
    })),
    ...dueCustomers.slice(0, 2).map((c) => ({
      key: `due-${c.phone}`,
      icon: Wallet,
      tone: "udhaar",
      title: c.name,
      sub: `${t("Owes {amt}", { amt: rupee(c.balance) })}${c.days > 0 ? ` · ${t("{n}d", { n: c.days })}` : ""}`,
      action: t("Remind"),
      actionIcon: MessageCircle,
      onClick: () => window.open(whatsappLink(c.phone, creditReminderText(activeShop?.name, c.name, c.balance)), "_blank", "noopener,noreferrer"),
    })),
  ];
  const TONE = {
    danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
    udhaar: { bg: "var(--udhaar-soft)", fg: "var(--udhaar)" },
  };

  const quick = [
    { label: t("Stock"), icon: PackagePlus, href: "/inventory", note: lowStockCount > 0 ? t("{n} low", { n: lowStockCount }) : null, noteColor: "var(--warn)" },
    { label: t("Udhaar"), icon: Wallet, href: "/credit", note: outstandingCredit > 0 ? rupee(outstandingCredit) : null, noteColor: "var(--udhaar)" },
    { label: t("Day close"), icon: Calculator, href: "/dayclose" },
  ];

  return {
    t, router, activeShop, user, isOwner,
    items, bills, movements, loading, detail, setDetail, customerDetail, setCustomerDetail,
    showInsights, setShowInsights,
    lowStockCount, stockValue, todaysBills, todaysSales, todaysProfit, outstandingCredit,
    bestCustomers, last7Days, categorySales, todaySplit, attention, TONE, quick,
  };
}
