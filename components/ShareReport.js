"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, MessageCircle } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { useT } from "@/lib/i18n";
import { rupee } from "@/lib/format";
import { whatsappLink } from "@/lib/messaging";
import { istDateString, periodRange, fetchPeriodSummary, periodText, PERIOD_TITLES } from "@/lib/periodReport";

// Daily / weekly / monthly sales + expenses summary, sent in one tap by
// email (to the owner's own address) or WhatsApp (owner picks the chat).
export default function ShareReport() {
  const t = useT();
  const { supabase, activeShopId, activeShop, showToast } = useShop();
  const [period, setPeriod] = useState("day");
  const [date, setDate] = useState(istDateString());
  const [data, setData] = useState({ s: null, prev: null });
  const [loading, setLoading] = useState(true);
  const [emailing, setEmailing] = useState(false);

  const range = useMemo(() => periodRange(period, date), [period, date]);

  useEffect(() => {
    if (!activeShopId) return;
    let live = true;
    setLoading(true);
    fetchPeriodSummary(supabase, activeShopId, period, date).then((res) => {
      if (!live) return;
      setData({ s: res.s, prev: res.prev });
      setLoading(false);
    });
    return () => { live = false; };
  }, [supabase, activeShopId, period, date]);

  const s = data.s || { bills: 0, sales: 0, cash: 0, digital: 0, credit: 0, expenses: 0, byCategory: [], net: 0, topItems: [] };
  const title = PERIOD_TITLES[period];
  const titleLabel = period === "day" ? t("Daily report") : period === "week" ? t("Weekly report") : t("Monthly report");
  const text = periodText({ shopName: activeShop?.name || "Shop", title, label: range.label, s, prev: data.prev, period });

  async function emailIt() {
    setEmailing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/reports/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ kind: "period", period, date, shopId: activeShopId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Email could not be sent.");
      showToast(t("Report emailed to {email}", { email: json.to }));
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setEmailing(false);
    }
  }

  const tabs = [["day", t("Daily")], ["week", t("Weekly")], ["month", t("Monthly")]];

  return (
    <div className="space-y-4">
      <div className="ks-card p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("Send a summary of your sales and expenses in one tap. Email goes only to your own address. WhatsApp opens so you choose who gets it.")}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex p-1 rounded-full" style={{ background: "var(--bg-surface-alt)" }}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
              style={period === key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <input type="date" value={date} max={istDateString()} onChange={(e) => e.target.value && setDate(e.target.value)} className="ks-input w-auto" />
      </div>

      <div className="ks-card p-5">
        <p className="ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] mb-3">{titleLabel} · {range.label}</p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> {t("Loading…")}</div>
        ) : (
          <div className="space-y-2 text-sm">
            <Row label={t("Bills")} value={s.bills} />
            <Row label={t("Sales")} value={rupee(s.sales)} />
            <Row label={t("Cash")} value={rupee(s.cash)} sub />
            <Row label={t("UPI/card")} value={rupee(s.digital)} sub />
            <Row label={t("Udhaar")} value={rupee(s.credit)} sub />
            {s.topItems.length > 0 && <p className="ks-mono text-[11px] uppercase tracking-wide pt-2" style={{ color: "var(--text-secondary)" }}>{t("Top sellers")}</p>}
            {s.topItems.map((i) => <Row key={i.name} label={`${i.name} × ${i.qty}`} value={rupee(i.amount)} sub />)}
            <Row label={t("Expenses")} value={rupee(s.expenses)} />
            {s.byCategory.map((c) => <Row key={c.category} label={c.category} value={rupee(c.amount)} sub />)}
            <div className="border-t border-[var(--border)] pt-2 mt-2">
              <Row label={t("Sales minus expenses")} value={rupee(s.net)} bold />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={emailIt} disabled={loading || emailing} className="ks-btn-primary inline-flex items-center gap-2 disabled:opacity-40">
          {emailing ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {t("Email me this report")}
        </button>
        <a
          href={whatsappLink("", text)}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={loading}
          className="ks-btn-primary inline-flex items-center gap-2"
          style={loading ? { opacity: 0.4, pointerEvents: "none" } : undefined}
        >
          <MessageCircle size={15} /> {t("Send on WhatsApp")}
        </a>
      </div>
    </div>
  );
}

function Row({ label, value, sub, bold }) {
  return (
    <div className={`flex justify-between gap-3 ${sub ? "pl-4" : ""} ${bold ? "font-bold" : ""}`} style={sub ? { color: "var(--text-secondary)" } : undefined}>
      <span>{label}</span>
      <span className="ks-mono">{value}</span>
    </div>
  );
}
