"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { PRO_PRICING, PRO_FEATURES, FREE_FEATURES, isPro } from "@/lib/pricing";

import { useT } from "@/lib/i18n";
export default function UpgradePage() {
  const t = useT();
  const { activeShop, updateActiveShop, showToast } = useShop();
  const [billing, setBilling] = useState("yearly"); // monthly | yearly
  const [saving, setSaving] = useState(false);
  const pro = isPro(activeShop);

  async function setPlan(plan) {
    setSaving(true);
    try {
      await updateActiveShop({ plan });
      showToast(plan === "pro" ? t("Switched to Nexper Pro") : t("Switched to Free plan"));
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pt-6 pb-10 max-w-2xl">
      <div className="mb-5">
        <h1 className="ks-display font-bold text-xl flex items-center gap-2">
          <Sparkles size={20} style={{ color: "var(--gold)" }} /> {t("Nexper Pro")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {t("Everything you need to run the counter is free, forever. Pro is for shops ready to grow past one till.")}
        </p>
      </div>

      <div className="ks-card p-4 mb-5 flex items-center justify-between text-sm" style={{ background: "var(--bg-surface-alt)" }}>
        <span className="font-semibold">
          {t("Current plan:")} <span style={{ color: pro ? "var(--gold)" : "var(--text-primary)" }}>{pro ? "Pro" : "Free"}</span>
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          {t("Testing toggle — no payment collected yet")}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="ks-card p-5">
          <p className="font-bold text-sm mb-1">{t("Free")}</p>
          <p className="ks-display font-bold text-2xl mb-3">₹0</p>
          <ul className="space-y-2 mb-4">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs">
                <Check size={14} className="shrink-0 mt-0.5" style={{ color: "var(--success)" }} />
                <span style={{ color: "var(--text-secondary)" }}>{t(f)}</span>
              </li>
            ))}
          </ul>
          {pro && (
            <button onClick={() => setPlan("free")} disabled={saving} className="ks-btn-outline w-full flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} {t("Switch to Free")}
            </button>
          )}
        </div>

        <div className="ks-card p-5" style={{ border: "1.5px solid var(--gold)" }}>
          <div className="flex items-center justify-between mb-1">
            <p className="font-bold text-sm">{t("Pro")}</p>
            <div className="flex text-[10px] font-semibold rounded-full overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={() => setBilling("monthly")}
                className="px-2 py-1"
                style={billing === "monthly" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
              >
                {t("Monthly")}
              </button>
              <button
                onClick={() => setBilling("yearly")}
                className="px-2 py-1"
                style={billing === "yearly" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
              >
                {t("Yearly")}
              </button>
            </div>
          </div>
          <p className="ks-display font-bold text-2xl mb-0.5">
            ₹{billing === "monthly" ? PRO_PRICING.monthlyInr : PRO_PRICING.yearlyInr}
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              /{billing === "monthly" ? "mo" : "yr"}
            </span>
          </p>
          {billing === "yearly" && (
            <p className="text-[11px] mb-3" style={{ color: "var(--success)" }}>
              {t("~24% cheaper than paying monthly")}
            </p>
          )}
          {billing === "monthly" && <div className="mb-3" />}
          <p className="text-[11px] font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
            {t("Everything in Free, plus:")}
          </p>
          <ul className="space-y-2 mb-4">
            {PRO_FEATURES.map((f) => (
              <li key={f.key} className="flex items-start gap-2 text-xs">
                <Check size={14} className="shrink-0 mt-0.5" style={{ color: "var(--gold)" }} />
                <div>
                  <span className="font-semibold">{t(f.label)}</span>
                  <span style={{ color: "var(--text-secondary)" }}> — {t(f.description)}</span>
                </div>
              </li>
            ))}
          </ul>
          {!pro && (
            <button onClick={() => setPlan("pro")} disabled={saving} className="ks-btn-primary w-full flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} {t("Switch to Pro")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
