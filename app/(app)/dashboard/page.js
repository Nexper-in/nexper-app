"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Wallet,
  AlertTriangle,
  TrendingUp,
  ArrowUpCircle,
  ArrowDownCircle,
  Users,
  Loader2,
  CalendarClock,
  Tag,
  Share2,
  Activity,
} from "lucide-react";
import { useShop } from "@/components/ShopContext";
import StatCard from "@/components/StatCard";
import StatDetailModal from "@/components/StatDetailModal";
import CustomerDetailModal from "@/components/CustomerDetailModal";
import { rupee, greeting, displayName } from "@/lib/format";
import { customerBalance, topCustomers } from "@/lib/dashboardHelpers";
import { fetchShopItems } from "@/lib/products";
import MiniBarChart from "@/components/MiniBarChart";
import { categoryColor } from "@/components/CategoryChip";
import { whatsappLink, dailyReportText } from "@/lib/messaging";

export default function DashboardPage() {
  const { supabase, activeShopId, activeShop, user, isOwner } = useShop();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [movements, setMovements] = useState([]);
  const [credits, setCredits] = useState([]);
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null); // 'items' | 'value' | 'low' | 'profit'
  const [customerDetail, setCustomerDetail] = useState(null);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 14);
    const [itemsData, { data: billsData }, { data: movesData }, { data: creditsData }, { data: batchesData }] = await Promise.all([
      fetchShopItems(supabase, activeShopId, { orderByCode: false }),
      supabase.from("bills").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }),
      supabase.from("movements").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }).limit(6),
      supabase.from("credits").select("*").eq("shop_id", activeShopId),
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

  const bestCustomers = useMemo(() => topCustomers(bills, 5), [bills]);

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

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading dashboard…
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="ks-hero p-6 sm:p-7 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.75)" }}>
              {greeting()}{displayName(user) ? `, ${displayName(user)}` : ""} 👋
            </p>
            <p className="ks-eyebrow mb-2" style={{ color: "var(--gold)" }}>Today&apos;s Sales</p>
            <div className="ks-hero-figure text-4xl sm:text-5xl">
              <sup className="text-xl sm:text-2xl">₹</sup>{rupee(todaysSales).slice(1)}
            </div>
            <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.75)" }}>
              {todaysBills.length} bill{todaysBills.length === 1 ? "" : "s"} · profit ~{rupee(todaysProfit)} today
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => window.open(whatsappLink("", dailyReportText(activeShop?.name || "Store", todaysBills, items)), "_blank")}
              className="ks-hero-btn flex items-center gap-1.5 text-xs px-3.5 py-2"
            >
              <Share2 size={13} /> Share report
            </button>
          </div>
        </div>
        <div className="ks-hero-rule mt-5" />
      </div>

      {expiringWithNames.length > 0 && (
        <div className="ks-card p-4 mb-4" style={{ borderLeft: "4px solid #C13F45" }}>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarClock size={16} style={{ color: "#C13F45" }} />
              <h2 className="ks-display font-bold text-sm">Expiring soon — today&apos;s risk check</h2>
            </div>
            {isOwner && (
              <button
                onClick={() =>
                  router.push(
                    `/clearance?items=${[...new Set(expiringWithNames.map((b) => b.shop_product_id))].join(",")}`
                  )
                }
                className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                style={{ background: "#C13F45", color: "#fff" }}
              >
                <Tag size={12} /> Run clearance offer
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {expiringWithNames.map((b) => (
              <span
                key={b.id}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full"
                style={{ background: b.days < 0 ? "#FDEAEA" : "#FCEEDA", color: b.days < 0 ? "#C13F45" : "#B5720B" }}
              >
                {b.itemName} · {b.qty_remaining} {b.unit} · {b.days < 0 ? `expired ${Math.abs(b.days)}d ago` : b.days === 0 ? "expires today" : `${b.days}d left`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
        <StatCard
          icon={<Package size={16} />}
          bar="var(--accent)" tintBg="var(--accent-soft-bg)" tintFg="var(--accent)"
          label="Items in stock"
          value={items.length}
          onClick={() => setDetail("items")}
        />
        <StatCard
          icon={<Wallet size={16} />}
          bar="#1F8A5F" tintBg="rgba(31,138,95,0.10)" tintFg="#1F8A5F"
          label="Stock value"
          value={rupee(stockValue)}
          onClick={() => setDetail("value")}
        />
        <StatCard
          icon={<AlertTriangle size={16} />}
          bar="#C13F45" tintBg="rgba(193,63,69,0.10)" tintFg="#C13F45"
          label="Low stock"
          value={lowStockCount}
          onClick={() => setDetail("low")}
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          bar="var(--gold)" tintBg="var(--gold-soft)" tintFg="var(--gold)"
          label="Today's profit"
          value={rupee(todaysProfit)}
          onClick={() => setDetail("profit")}
        />
        <StatCard
          icon={<Wallet size={16} />}
          bar="#B5720B" tintBg="rgba(181,114,11,0.10)" tintFg="#B5720B"
          label="Outstanding udhaar"
          value={rupee(outstandingCredit)}
          onClick={() => router.push("/credit")}
        />
      </div>

      {(!activeShop?.enabled_modules || activeShop.enabled_modules.includes("charts")) && (
      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div className="ks-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="ks-display font-bold">Sales this week</h2>
            <span className="ks-mono text-xs text-[#6B7280]">last 7 days</span>
          </div>
          <MiniBarChart
            data={last7Days}
            color="#5B2CDB"
            formatValue={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          />
        </div>

        <div className="ks-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="ks-display font-bold">Top categories</h2>
            <span className="ks-mono text-xs text-[#6B7280]">last 30 days</span>
          </div>
          {categorySales.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No sales yet — start billing to see category breakdown.</p>
          ) : (
            <div className="space-y-2.5">
              {categorySales.map(([cat, total]) => {
                const c = categoryColor(cat);
                const pct = Math.round((total / categorySales[0][1]) * 100);
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-semibold" style={{ color: c.text }}>{cat}</span>
                      <span className="ks-mono text-xs text-[#6B7280]">{rupee(total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#E7E9F3] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c.text }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 mt-5">
        <div className="ks-card ks-panel-wash overflow-hidden" style={{ "--wash": "rgba(193,63,69,0.06)" }}>
          <div className="px-5 py-4 border-b border-[#E7E9F3] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="ks-tint-icon" style={{ "--tint-bg": "rgba(193,63,69,0.10)", "--tint-fg": "#C13F45" }}>
                <AlertTriangle size={15} />
              </div>
              <h2 className="ks-display font-bold">Stock alerts</h2>
              {lowItems.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#FDEAEA", color: "#C13F45" }}>
                  {lowItems.length}
                </span>
              )}
            </div>
            {lowItems.length > 0 && (
              <button
                onClick={() => router.push("/inventory")}
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: "var(--accent-soft-bg)", color: "var(--accent)" }}
              >
                View all
              </button>
            )}
          </div>
          <div className="divide-y divide-[#F3F4F8]">
            {lowItems.length === 0 && (
              <p className="text-sm text-[#6B7280] px-5 py-6">Nothing running low right now. 🎉</p>
            )}
            {[...lowItems].sort((a, b) => a.stock - b.stock).slice(0, 6).map((i) => {
              const isOut = i.stock === 0;
              return (
                <div key={i.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#F8F9FD] transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wide ${isOut ? "ks-pulse" : ""}`}
                      style={isOut
                        ? { background: "#FDEAEA", color: "#C13F45" }
                        : { background: "#FFF4E0", color: "#B5720B" }}
                    >
                      {isOut ? "OUT" : "LOW"}
                    </span>
                    <span className="font-medium text-sm truncate">{i.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="ks-mono text-xs font-semibold" style={{ color: isOut ? "#C13F45" : "#B5720B" }}>
                      {i.stock} {i.unit}
                    </span>
                    <button
                      onClick={() => router.push("/inventory")}
                      className="text-[11px] font-bold px-2 py-1 rounded-lg"
                      style={{ background: "var(--accent-soft-bg)", color: "var(--accent)" }}
                    >
                      + Stock
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ks-card ks-panel-wash" style={{ "--wash": "var(--accent-soft-bg)" }}>
          <div className="px-5 py-4 border-b border-[#E7E9F3] flex items-center gap-2.5">
            <div className="ks-tint-icon" style={{ "--tint-bg": "var(--accent-soft-bg)", "--tint-fg": "var(--accent)" }}>
              <Activity size={15} />
            </div>
            <h2 className="ks-display font-bold">Recent stock movement</h2>
          </div>
          <div className="p-5 space-y-3 max-h-72 overflow-y-auto ks-scroll">
            {movements.length === 0 && <p className="text-sm text-[#6B7280]">No stock movement logged yet.</p>}
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {m.type === "in" ? (
                    <ArrowUpCircle size={16} style={{ color: "var(--accent)" }} />
                  ) : (
                    <ArrowDownCircle size={16} className="text-[#C13F45]" />
                  )}
                  <div>
                    <span className="font-medium">{m.item_name}</span>
                    <span className="text-[#6B7280] ks-mono text-xs ml-2">{m.reason}</span>
                  </div>
                </div>
                <span className="ks-mono font-semibold" style={{ color: m.type === "in" ? "var(--accent)" : "#C13F45" }}>
                  {m.type === "in" ? "+" : "−"}
                  {m.qty}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="ks-card ks-panel-wash" style={{ "--wash": "var(--gold-soft)" }}>
          <div className="px-5 py-4 border-b border-[#E7E9F3] flex items-center gap-2.5">
            <div className="ks-tint-icon" style={{ "--tint-bg": "var(--gold-soft)", "--tint-fg": "var(--gold)" }}>
              <Users size={15} />
            </div>
            <h2 className="ks-display font-bold">Top customers</h2>
          </div>
          <div className="p-5 space-y-1 max-h-72 overflow-y-auto ks-scroll">
            {bestCustomers.length === 0 && <p className="text-sm text-[#6B7280]">No customer purchases recorded yet.</p>}
            {bestCustomers.map((c, i) => (
              <button
                key={c.phone}
                onClick={() => setCustomerDetail(c)}
                className="w-full flex items-center justify-between text-sm py-1.5 -mx-1 px-1 rounded-lg hover:bg-[#F8F9FD] text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`ks-medal ${i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "plain"}`}>
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-[#6B7280]">
                      {c.visits} visit{c.visits === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <span className="ks-mono font-semibold">{rupee(c.total)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {detail && (
        <StatDetailModal
          mode={detail}
          items={items}
          todaysBills={todaysBills}
          stockValue={stockValue}
          onClose={() => setDetail(null)}
          onGoInventory={() => {
            setDetail(null);
            router.push("/inventory");
          }}
          onAddItems={() => {
            setDetail(null);
            router.push("/inventory?add=1");
          }}
        />
      )}
      {customerDetail && <CustomerDetailModal customer={customerDetail} bills={bills} onClose={() => setCustomerDetail(null)} />}
    </div>
  );
}
