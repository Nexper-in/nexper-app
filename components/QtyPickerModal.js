"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { rupee } from "@/lib/format";
import { SMALLER_UNIT, UNIT_FACTOR } from "@/lib/voiceHelpers";
import { useT } from "@/lib/i18n";

export default function QtyPickerModal({ item, onClose, onConfirm }) {
  const t = useT();
  const smallerUnit = SMALLER_UNIT[item.unit]; // 'g' for kg items, 'ml' for l items, undefined otherwise
  const [inputUnit, setInputUnit] = useState(item.unit);
  const isMeasured = ["kg", "g", "l", "ml"].includes(item.unit);
  const step = inputUnit === item.unit ? (isMeasured ? 0.1 : 1) : 1;
  const [qty, setQty] = useState("1");
  const rawNum = Number(qty);
  // Convert whatever was typed into the item's actual stock unit
  const num = inputUnit === item.unit ? rawNum : rawNum / (UNIT_FACTOR[inputUnit] || 1);
  const valid = rawNum > 0 && num <= item.stock;

  return (
    <Modal title={item.name} onClose={onClose}>
      <div className="space-y-3.5">
        <p className="text-xs text-[var(--text-secondary)]">
          {t("Available:")} <span className="ks-mono font-semibold text-[var(--text-primary)]">{item.stock} {item.unit}</span> ·{" "}
          {item.mrp > item.price && !item.originalPrice && (
            <span className="line-through mr-1 opacity-60 ks-mono">{rupee(item.mrp)}</span>
          )}
          {rupee(item.price)} / {item.unit}
          {item.mrp > item.price && !item.originalPrice && (
            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
              {t("{n}% OFF", { n: Math.round(((item.mrp - item.price) / item.mrp) * 100) })}
            </span>
          )}
        </p>

        {smallerUnit && (
          <div className="flex gap-1.5 bg-[var(--bg-surface-alt)] p-1 rounded-full w-fit">
            {[item.unit, smallerUnit].map((u) => (
              <button
                key={u}
                onClick={() => {
                  setInputUnit(u);
                  setQty("1");
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${inputUnit === u ? "bg-[var(--strong)] text-[var(--on-strong)]" : "text-[var(--text-secondary)]"}`}
              >
                {u}
              </button>
            ))}
          </div>
        )}

        <Field label={t("How many {unit} to add?", { unit: inputUnit })}>
          <input
            autoFocus
            type="number"
            step={step}
            min={step}
            className="ks-input text-lg font-semibold ks-mono"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && valid && onConfirm(num)}
          />
        </Field>
        {inputUnit !== item.unit && rawNum > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            = <span className="ks-mono font-semibold text-[var(--text-primary)]">{num} {item.unit}</span>
          </p>
        )}
        {num > item.stock && <p className="text-xs text-[var(--danger)] font-medium">{t("Only {n} {unit} in stock.", { n: item.stock, unit: item.unit })}</p>}
        <div className="flex items-center justify-between py-2 border-t border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{t("Line total")}</span>
          <span className="ks-mono text-lg font-bold text-[var(--accent-soft-text)]">{rupee((num > 0 ? num : 0) * item.price)}</span>
        </div>
        <button disabled={!valid} onClick={() => onConfirm(num)} className="ks-btn-primary w-full">
          {t("Add to bill")}
        </button>
      </div>
    </Modal>
  );
}
