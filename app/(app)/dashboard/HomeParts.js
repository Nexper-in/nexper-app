"use client";

import {
  Package, Wallet, AlertTriangle, TrendingUp, ArrowUpCircle, ArrowDownCircle, Activity, Share2, Receipt, CheckCircle2,
} from "lucide-react";
import GettingStarted from "@/components/GettingStarted";
import StatCard from "@/components/StatCard";
import StatDetailModal from "@/components/StatDetailModal";
import CustomerDetailModal from "@/components/CustomerDetailModal";
import MiniBarChart from "@/components/MiniBarChart";
import { categoryColor } from "@/components/CategoryChip";
import { rupee, greeting, displayName } from "@/lib/format";
import { whatsappLink, dailyReportText } from "@/lib/messaging";

// Pieces of Home that look the same on a phone and a laptop. Each screen
// (HomeMobile / HomeDesktop) decides which to show and how to lay them out.


export function TodayHero({ vm }) {
  const { t, user, activeShop, todaysBills, todaysSales, todaysProfit, todaySplit, items } = vm;
  return (
    <>
      {/* Today */}
      <div className="ks-hero p-5 sm:p-6 mb-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            {t(greeting())}
            {displayName(user) ? `, ${displayName(user)}` : ""}
          </p>
          <button
            onClick={() => window.open(whatsappLink("", dailyReportText(activeShop?.name || "Store", todaysBills, items)), "_blank")}
            className="ks-hero-btn w-8 h-8 flex items-center justify-center shrink-0"
            aria-label={t("Share today's report on WhatsApp")}
            title={t("Share today's report")}
          >
            <Share2 size={14} />
          </button>
        </div>
        <p className="ks-eyebrow mt-3 mb-1" style={{ color: "var(--gold)" }}>{t("Today")}</p>
        <div className="ks-hero-figure text-[44px] sm:text-5xl">
          <sup className="text-2xl">₹</sup>
          {rupee(todaysSales).slice(1)}
        </div>
        <p className="text-sm mt-1.5" style={{ color: "rgba(255,255,255,0.75)" }}>
          {todaysBills.length === 1 ? t("{n} bill", { n: 1 }) : t("{n} bills", { n: todaysBills.length })}
          {todaysProfit > 0 ? ` · ${t("profit ~{amt}", { amt: rupee(todaysProfit) })}` : ""}
        </p>
        {todaysBills.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              [t("Cash"), todaySplit.cash],
              [t("UPI"), todaySplit.upi],
              [t("Udhaar"), todaySplit.udhaar],
            ].map(([label, v]) => (
              <div key={label} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.08)" }}>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</p>
                <p className="ks-mono text-sm font-semibold text-white">{rupee(v)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// The one thing the counter does most, plus three shortcuts.
export function NewBillAndQuick({ vm }) {
  const { t, router, quick } = vm;
  return (
    <>
      {/* The one thing the counter does most */}
      <button
        onClick={() => router.push("/billing")}
        className="ks-btn-primary w-full flex items-center justify-center gap-2 py-4 text-base mb-3"
      >
        <Receipt size={19} /> {t("New bill")}
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
    </>
  );
}


export function AttentionList({ vm }) {
  const { t, attention, TONE, items } = vm;
  return (
    <>
      {/* Needs attention */}
      <h2 className="ks-display font-bold text-base mb-2">{t("Needs attention")}</h2>
      <div className="ks-card overflow-hidden mb-5">
        {attention.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-5">
            <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
            <div>
              <p className="text-sm font-semibold">{t("All clear")}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {items.length === 0 ? t("Add your stock to start billing.") : t("Nothing needs you right now.")}
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
    </>
  );
}


export function StatCards({ vm, wide }) {
  const { t, items, stockValue, todaysProfit, lowStockCount, setDetail } = vm;
  return (
    <>
      <div className={wide ? "grid grid-cols-2 min-[1500px]:grid-cols-4 gap-3" : "grid grid-cols-2 gap-3"}>
        <StatCard
          icon={<Package size={16} />}
          bar="var(--accent)" tintBg="var(--accent-soft-bg)" tintFg="var(--accent)"
          label={t("Items in stock")}
          value={items.length}
          onClick={() => setDetail("items")}
        />
        <StatCard
          icon={<Wallet size={16} />}
          bar="var(--success-solid)" tintBg="var(--success-soft)" tintFg="var(--success)"
          label={t("Stock value")}
          value={rupee(stockValue)}
          onClick={() => setDetail("value")}
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          bar="var(--gold)" tintBg="var(--gold-soft)" tintFg="var(--gold)"
          label={t("Today's profit")}
          value={rupee(todaysProfit)}
          onClick={() => setDetail("profit")}
        />
        <StatCard
          icon={<AlertTriangle size={16} />}
          bar="var(--danger-solid)" tintBg="var(--danger-soft)" tintFg="var(--danger)"
          label={t("Low stock")}
          value={lowStockCount}
          onClick={() => setDetail("low")}
        />
      </div>
    </>
  );
}


export function WeekChart({ vm }) {
  const { t, last7Days } = vm;
  return (
    <>
      <div className="ks-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="ks-display font-bold">{t("Sales this week")}</h2>
          <span className="ks-mono text-xs text-[var(--text-secondary)]">{t("last 7 days")}</span>
        </div>
        <MiniBarChart data={last7Days} color="var(--accent)" formatValue={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
      </div>
    </>
  );
}


export function TopCategories({ vm }) {
  const { t, categorySales } = vm;
  return (
    <>
      {categorySales.length > 0 && (
        <div className="ks-card p-5">
          <h2 className="ks-display font-bold mb-4">{t("Top categories")} <span className="text-xs font-normal text-[var(--text-secondary)]">· {t("30 days")}</span></h2>
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
    </>
  );
}


export function TopCustomers({ vm }) {
  const { t, bestCustomers, setCustomerDetail } = vm;
  return (
    <>
      {bestCustomers.length > 0 && (
        <div className="ks-card p-5">
          <h2 className="ks-display font-bold mb-3">{t("Top customers")}</h2>
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
                      {c.visits === 1 ? t("{n} visit", { n: 1 }) : t("{n} visits", { n: c.visits })}
                    </div>
                  </div>
                </div>
                <span className="ks-mono font-semibold">{rupee(c.total)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}


export function RecentMovement({ vm }) {
  const { t, movements } = vm;
  return (
    <>
      {movements.length > 0 && (
        <div className="ks-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={15} style={{ color: "var(--accent-soft-text)" }} />
            <h2 className="ks-display font-bold">{t("Recent stock movement")}</h2>
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
    </>
  );
}


export function HomeModals({ vm }) {
  const { t, items, bills, todaysBills, stockValue, router, detail, setDetail, customerDetail, setCustomerDetail } = vm;
  return (
    <>
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
    </>
  );
}

// First-week checklist for a new shop; hides itself when done or dismissed.
export function StartedCard({ vm }) {
  const { activeShop, items, bills } = vm;
  return <GettingStarted shop={activeShop} items={items} bills={bills} />;
}
