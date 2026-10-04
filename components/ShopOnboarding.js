"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Field from "@/components/ui/Field";
import ShopTypeIcon from "@/components/ShopTypeIcon";
import { SHOP_TYPES } from "@/lib/shopTypes";
import { useT } from "@/lib/i18n";
import { useShop } from "@/components/ShopContext";

// One owner, one shop, chosen right here at signup — there's no "add
// another shop" flow, so this only ever renders once, for a brand-new
// account with zero shops (see app/(app)/layout.js).
export function AddShopOnboarding({ onAdd }) {
  const t = useT();
  const { platform } = useShop();
  const [type, setType] = useState("kirana");
  const [name, setName] = useState("");
  const [seedTemplate, setSeedTemplate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      await onAdd(name.trim(), type, { seedTemplate });
    } catch (err) {
      // The database refuses new shops when sign-up is invite-only or closed
      // (platform admin page): say so in plain words.
      setError(/row-level security/i.test(err.message) ? platform.signup.message || t("Nexper is invite-only right now. Sign up with the email you were invited on.") : err.message);
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6 text-center">
          <p className="ks-wordmark text-[32px] mb-4">
            Ne<span className="ks-grad-text">x</span>per
          </p>
          <h1 className="ks-display text-2xl font-bold">{t("Set up your shop")}</h1>
          <p className="text-sm text-muted mt-1">{t("One last step before you start billing.")}</p>
        </div>
        <div className="ks-card p-6 space-y-3.5">
          <Field label={t("Business type")}>
            <div className="grid grid-cols-2 gap-2">
              {SHOP_TYPES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setType(st.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                    type === st.id ? "border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]" : "border-[var(--border)] text-[var(--text-secondary)]"
                  }`}
                >
                  <ShopTypeIcon type={st.id} size={15} /> {t(st.label)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("Shop name")}>
            <input
              className="ks-input"
              placeholder={t("e.g. Sharma General Store")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={seedTemplate}
              onChange={(e) => setSeedTemplate(e.target.checked)}
            />
            {t("Add 10 starter items for this business type so you can bill right away. You can change prices and stock any time.")}
          </label>
          {error && (
            <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            disabled={!name.trim() || saving}
            onClick={handleCreate}
            className="ks-btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t("Create shop")}
          </button>
        </div>
      </div>
    </main>
  );
}
