"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { PRO_PRICING } from "@/lib/pricing";

import { useT } from "@/lib/i18n";
// Inline "this needs Pro" block — used both full-page (ModuleGuard) and
// inside a Modal (feature-level gates like OCR scan or extra staff seats).
export default function UpgradePrompt({ feature, description }) {
  const t = useT();
  const router = useRouter();
  return (
    <div className="ks-card p-6 text-center max-w-sm mx-auto mt-6">
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-3"
        style={{ background: "var(--gold-soft, #FCEEDA)", color: "var(--gold, #B8902E)" }}
      >
        <Lock size={18} />
      </div>
      <p className="font-bold text-sm mb-1">{t("{feature} is a Pro feature", { feature })}</p>
      {description && (
        <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
      )}
      <button onClick={() => router.push("/upgrade")} className="ks-btn-primary w-full">
        {t("Upgrade to Pro — ₹{price}/mo", { price: PRO_PRICING.monthlyInr })}
      </button>
    </div>
  );
}
