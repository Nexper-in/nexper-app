"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import ShopTypeIcon from "@/components/ShopTypeIcon";
import { useShop } from "@/components/ShopContext";
import { SHOP_TYPES } from "@/lib/shopTypes";
import { useT } from "@/lib/i18n";

// Turns the database's refusal into words in the person's language.
export function branchErrorText(message, t) {
  const m = /allows (\d+) shop/.exec(message || "");
  if (m) return t("Your plan allows {n} shop(s). Contact us to add more branches.", { n: m[1] });
  return message || t("Something went wrong. Try again.");
}

// Adds a branch to the company. It can start with the same item list as an
// existing shop (the products are shared across the company; only this shop's
// own prices and stock are created).
export default function AddBranchModal({ onClose, onCreated }) {
  const t = useT();
  const { shops, activeShop, addShop } = useShop();
  const [name, setName] = useState("");
  const [type, setType] = useState(activeShop?.type || "kirana");
  const [copy, setCopy] = useState(true);
  const [from, setFrom] = useState(activeShop?.id || shops[0]?.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setSaving(true);
    setError("");
    try {
      const shop = await addShop(name.trim(), type, { copyFromShopId: copy ? from : null });
      onCreated?.(shop);
      onClose();
    } catch (e) {
      setError(branchErrorText(e.message, t));
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Add a branch")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Branch name")}>
          <input autoFocus className="ks-input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Sri Stores, Gandhi Road")} />
        </Field>
        <Field label={t("Business type")}>
          <div className="flex flex-wrap gap-1.5">
            {SHOP_TYPES.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setType(st.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${type === st.id ? "border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]" : "border-[var(--border)] text-[var(--text-secondary)]"}`}
              >
                <ShopTypeIcon type={st.id} size={13} /> {t(st.label)}
              </button>
            ))}
          </div>
        </Field>
        {shops.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
              <span>{t("Start with the same items as another shop (prices copied, stock at zero)")}</span>
            </label>
            {copy && shops.length > 1 && (
              <select className="ks-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("Copy items from")}>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button type="button" disabled={!name.trim() || saving} onClick={create} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Add branch")}
        </button>
      </div>
    </Modal>
  );
}
