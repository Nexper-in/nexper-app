"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { useT } from "@/lib/i18n";
import { planPriceChange } from "@/lib/bulkPrice";
import { rupee } from "@/lib/format";

// Change many selling prices at once: pick a category (or all), a percent or
// rupee change, and see every old -> new price before anything is saved.
export default function BulkPriceModal({ items, supabase, showToast, onClose, onDone }) {
  const t = useT();
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState("percent");
  const [value, setValue] = useState("");
  const [roundTo, setRoundTo] = useState("1");
  const [capMrp, setCapMrp] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items]
  );
  const rows = useMemo(
    () => planPriceChange(items, { category: category || null, mode, value: Number(value), roundTo: Number(roundTo), capMrp }),
    [items, category, mode, value, roundTo, capMrp]
  );
  const belowCost = rows.filter((r) => r.belowCost).length;

  async function apply() {
    setSaving(true);
    setError("");
    try {
      for (let i = 0; i < rows.length; i += 10) {
        const chunk = rows.slice(i, i + 10);
        const results = await Promise.all(
          chunk.map((r) => supabase.from("shop_products").update({ price: r.next }).eq("id", r.id))
        );
        const failed = results.find((r) => r.error);
        if (failed) throw failed.error;
      }
      showToast(t("{n} prices updated", { n: rows.length }));
      onDone();
    } catch (err) {
      setError(err.message || String(err));
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Bulk price update")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Category")}>
          <select className="ks-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("All items")}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Change by")}>
            <select className="ks-input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="percent">{t("Percent (%)")}</option>
              <option value="amount">{t("Rupees (₹)")}</option>
            </select>
          </Field>
          <Field label={t("Amount (use − to lower)")}>
            <input type="number" inputMode="decimal" className="ks-input" placeholder="5" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>
        <Field label={t("Round to")}>
          <select className="ks-input" value={roundTo} onChange={(e) => setRoundTo(e.target.value)}>
            <option value="0">{t("Exact")}</option>
            <option value="0.5">{t("Nearest ₹0.50")}</option>
            <option value="1">{t("Nearest ₹1")}</option>
            <option value="5">{t("Nearest ₹5")}</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={capMrp} onChange={(e) => setCapMrp(e.target.checked)} />
          {t("Never go above MRP")}
        </label>

        {rows.length > 0 ? (
          <div className="rounded-xl border max-h-52 overflow-y-auto ks-scroll" style={{ borderColor: "var(--border)" }}>
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 tabular-nums text-xs">
                  <span className="text-[var(--text-secondary)] line-through">{rupee(r.old)}</span>{" → "}
                  <b style={{ color: r.belowCost ? "var(--danger)" : undefined }}>{rupee(r.next)}</b>
                  {r.capped && <span className="ml-1 text-[var(--text-secondary)]">MRP</span>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">{value ? t("No prices would change.") : t("Enter a change to see the new prices.")}</p>
        )}
        {belowCost > 0 && (
          <p className="text-xs" style={{ color: "var(--warn)" }}>
            {t("{n} items would sell below purchase price.", { n: belowCost })}
          </p>
        )}
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button disabled={!rows.length || saving} onClick={apply} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Update {n} prices", { n: rows.length })}
        </button>
      </div>
    </Modal>
  );
}
