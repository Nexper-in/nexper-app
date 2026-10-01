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
  Loader2,
  CalendarClock,
  Share2,
  Activity,
  Receipt,
  PackagePlus,
  Calculator,
  ChevronDown,
  MessageCircle,
  CheckCircle2,
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
import { whatsappLink, dailyReportText, creditReminderText } from "@/lib/messaging";

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
  const [showInsights, setShowInsights] = useState(false);

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

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

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
        sub: i.stock === 0 ? "Out of stock" : `Only ${i.stock} ${i.unit} left`,
        action: "Add stock",
        onClick: () => router.push(`/inventory?q=${encodeURIComponent(i.name)}`),
      })),
    ...expiringWithNames.slice(0, 1).map((b) => ({
      key: `exp-${b.id}`,
      icon: CalendarClock,
      tone: b.days <= 0 ? "danger" : "warn",
      title: b.itemName,
      sub: `${b.qty_remaining} ${b.unit} · ${b.days < 0 ? `expired ${Math.abs(b.days)}d ago` : b.days === 0 ? "expires today" : `expires in ${b.days}d`}`,
      action: isOwner ? "Offer" : null,
      onClick: () => router.push(`/clearance?items=${b.shop_product_id}`),
    })),
    ...dueCustomers.slice(0, 2).map((c) => ({
      key: `due-${c.phone}`,
      icon: Wallet,
      tone: "udhaar",
      title: c.name,
      sub: `Owes ${rupee(c.balance)}${c.days > 0 ? ` · ${c.days}d` : ""}`,
      action: "Remind",
      actionIcon: MessageCircle,
      onClick: () => window.open(whatsappLink(c.phone, creditReminderText(activeShop?.name, c.name, c.balance)), "_blank"),
    })),
  ];
  const TONE = {
    danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
    udhaar: { bg: "var(--udhaar-soft)", fg: "var(--udhaar)" },
  };

  const quick = [
    { label: "Stock", icon: PackagePlus, href: "/inventory", note: lowStockCount > 0 ? `${lowStockCount} low` : null, noteColor: "var(--warn)" },
    { label: "Udhaar", icon: Wallet, href: "/credit", note: outstandingCredit > 0 ? rupee(outstandingCredit) : null, noteColor: "var(--udhaar)" },
    { label: "Day close", icon: Calculator, href: "/dayclose" },
  ];

  return (
    <div className="pt-5 pb-4 max-w-2xl">
      {/* Today */}
      <div className="ks-hero p-5 sm:p-6 mb-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            {greeting()}
            {displayName(user) ? `, ${displayName(user)}` : ""}
          </p>
          <button
            onClick={() => window.open(whatsappLink("", dailyReportText(activeShop?.name || "Store", todaysBills, items)), "_blank")}
            className="ks-hero-btn w-8 h-8 flex items-center justify-center shrink-0"
            aria-label="Share today's report on WhatsApp"
            title="Share today's report"
          >
            <Share2 size={14} />
          </button>
        </div>
        <p className="ks-eyebrow mt-3 mb-1" style={{ color: "var(--gold)" }}>Today</p>
        <div className="ks-hero-figure text-[44px] sm:text-5xl">
          <sup className="text-2xl">₹</sup>
          {rupee(todaysSales).slice(1)}
        </div>
        <p className="text-sm mt-1.5" style={{ color: "rgba(255,255,255,0.75)" }}>
          {todaysBills.length} bill{todaysBills.length === 1 ? "" : "s"}
          {todaysProfit > 0 ? ` · profit ~${rupee(todaysProfit)}` : ""}
        </p>
        {todaysBills.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              ["Cash", todaySplit.cash],
              ["UPI", todaySplit.upi],
              ["Udhaar", todaySplit.udhaar],
            ].map(([label, v]) => (
              <div key={label} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.08)" }}>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</p>
                <p className="ks-mono text-sm font-semibold text-white">{rupee(v)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The one thing the counter does most */}
      <button
        onClick={() => router.push("/billing")}
        className="ks-btn-primary w-full flex items-center justify-center gap-2 py-4 text-base mb-3"
      >
        <Receipt size={19} /> New bill
      </button>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {quick.map(({ label, icon: Icon, href, note, noteColor }) => (
          <button
            key={label}
            onClick={() => router.push(href)}
            className="ks-card flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 transition-transform active:scale-[.97]"
          >
            <span className="ks-tint-icon">
              <Icon size={16} />
            </span>
            <span className="text-xs font-semibold">{label}</span>
            {note && <span className="ks-mono text-[10px]" style={{ color: noteColor }}>{note}</span>}
          </button>
        ))}
      </div>

      {/* Needs attention */}
      <h2 className="ks-display font-bold text-base mb-2">Needs attention</h2>
      <div className="ks-card overflow-hidden mb-5">
        {attention.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-5">
            <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
            <div>
              <p className="text-sm font-semibold">All clear</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {items.length === 0 ? "Add your stock to start billing." : "Nothing needs you right now."}
              </p>
            </div>
          </div>
        ) : (
          attention.map((a) => {
            const t = TONE[a.tone];
            const ActionIcon = a.actionIcon;
            return (
              <div key={a.key} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.bg, color: t.fg }}>
                  <a.icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{a.title}</p>
                  <p className="text-xs" style={{ color: t.fg }}>{a.sub}</p>
                </div>
                {a.action && (
                  <button
                    onClick={a.onClick}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 flex items-center gap-1"
                    style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}
                  >
                    {ActionIcon && <ActionIcon size={12} />}
                    {a.action}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Everything else, folded away */}
      <button
        onClick={() => setShowInsights((v) => !v)}
        aria-expanded={showInsights}
        className="w-full flex items-center justify-between text-sm font-semibold py-2"
        style={{ color: "var(--text-secondary)" }}
      >
        More insights
        <ChevronDown size={16} className={`transition-transform ${showInsights ? "rotate-180" : ""}`} />
      </button>

      {showInsights && (
        <div className="space-y-4 mt-2 ks-fade-up">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Package size={16} />}
              bar="var(--accent)" tintBg="var(--accent-soft-bg)" tintFg="var(--accent)"
              label="Items in stock"
              value={items.length}
              onClick={() => setDetail("items")}
            />
            <StatCard
              icon={<Wallet size={16} />}
              bar="var(--success-solid)" tintBg="var(--success-soft)" tintFg="var(--success)"
              label="Stock value"
              value={rupee(stockValue)}
              onClick={() => setDetail("value")}
            />
            <StatCard
              icon={<TrendingUp size={16} />}
              bar="var(--gold)" tintBg="var(--gold-soft)" tintFg="var(--gold)"
              label="Today's profit"
              value={rupee(todaysProfit)}
              onClick={() => setDetail("profit")}
            />
            <StatCard
              icon={<AlertTriangle size={16} />}
              bar="var(--danger-solid)" tintBg="var(--danger-soft)" tintFg="var(--danger)"
              label="Low stock"
              value={lowStockCount}
              onClick={() => setDetail("low")}
            />
          </div>

          <div className="ks-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="ks-display font-bold">Sales this week</h2>
              <span className="ks-mono text-xs text-[var(--text-secondary)]">last 7 days</span>
            </div>
            <MiniBarChart data={last7Days} color="var(--accent)" formatValue={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
          </div>

          {categorySales.length > 0 && (
            <div className="ks-card p-5">
              <h2 className="ks-display font-bold mb-4">Top categories <span className="text-xs font-normal text-[var(--text-secondary)]">· 30 days</span></h2>
              <div className="space-y-2.5">
                {categorySales.map(([cat, total]) => {
                  const c = categoryColor(cat);
                  const pct = Math.round((total / categorySales[0][1]) * 100);
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-semibold" style={{ color: c.text }}>{cat}</span>
                        <span className="ks-mono text-xs text-[var(--text-secondary)]">{rupee(total)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--bg-surface-alt)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.base }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {bestCustomers.length > 0 && (
            <div className="ks-card p-5">
              <h2 className="ks-display font-bold mb-3">Top customers</h2>
              <div className="space-y-1">
                {bestCustomers.map((c, i) => (
                  <button
                    key={c.phone}
                    onClick={() => setCustomerDetail(c)}
                    className="w-full flex items-center justify-between text-sm py-1.5 -mx-1 px-1 rounded-lg hover:bg-[var(--bg-surface-alt)] text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`ks-medal ${i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "plain"}`}>{i + 1}</span>
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {c.visits} visit{c.visits === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <span className="ks-mono font-semibold">{rupee(c.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {movements.length > 0 && (
            <div className="ks-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity size={15} style={{ color: "var(--accent-soft-text)" }} />
                <h2 className="ks-display font-bold">Recent stock movement</h2>
              </div>
              <div className="space-y-3">
                {movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      {m.type === "in" ? (
                        <ArrowUpCircle size={16} style={{ color: "var(--success)" }} />
                      ) : (
                        <ArrowDownCircle size={16} style={{ color: "var(--danger)" }} />
                      )}
                      <span className="font-medium truncate">{m.item_name}</span>
                      <span className="text-[var(--text-secondary)] ks-mono text-xs shrink-0">{m.reason}</span>
                    </div>
                    <span className="ks-mono font-semibold shrink-0" style={{ color: m.type === "in" ? "var(--success)" : "var(--danger)" }}>
                      {m.type === "in" ? "+" : "−"}
                      {m.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
