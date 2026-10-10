"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { rupee } from "@/lib/format";
import { returnableLines, refundFor, refundMethods } from "@/lib/returns";
import { useT } from "@/lib/i18n";

// T() only marks the words for the translation checker; t() translates them on screen.
const T = (text) => text;
const METHOD_LABEL = { cash: T("Cash"), upi: T("UPI"), card: T("Card"), bank: T("Bank transfer"), credit: T("Reduce udhaar") };

// Take items back from a bill. The database does the real work in one step
// (stock back on the shelf, refund recorded, udhaar reduced); this screen only
// picks the quantities and shows the refund before the owner confirms.
export default function ReturnModal({ bill, returnsForBill, supabase, shopId, onClose, onDone }) {
  const t = useT();
  const lines = useMemo(() => returnableLines(bill, returnsForBill), [bill, returnsForBill]);
  const methods = useMemo(() => refundMethods(bill), [bill]);
  const [picked, setPicked] = useState({});
  const [method, setMethod] = useState(methods[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refund = refundFor(bill, lines, picked);
  const chosen = lines.filter((l) => Number(picked[l.shop_product_id]) > 0);
  const tooMany = lines.some((l) => Number(picked[l.shop_product_id] || 0) > l.left);

  function setQty(l, v) {
    setPicked((p) => ({ ...p, [l.shop_product_id]: v }));
  }

  async function handleReturn() {
    setSaving(true);
    setError("");
    const { data, error: err } = await supabase.rpc("process_return", {
      p_shop_id: shopId,
      p_bill_id: bill.id,
      p_lines: chosen.map((l) => ({ shop_product_id: l.shop_product_id, qty: Number(picked[l.shop_product_id]) })),
      p_refund_method: method,
      p_note: note.trim() || null,
    });
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    onDone(data);
  }

  return (
    <Modal title={t("Return from bill {no}", { no: bill.bill_no })} onClose={onClose}>
      {lines.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{t("Everything on this bill has already been returned.")}</p>
      ) : (
        <div className="space-y-3.5">
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.shop_product_id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-alt)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{l.name}</div>
                  <div className="text-xs text-[var(--text-secondary)] ks-mono break-words">
                    {t("{left} {unit} can be returned · {price} each", { left: l.left, unit: l.unit, price: rupee(l.price) })}
                  </div>
                </div>
                <div className="w-20 shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={l.left}
                    step="any"
                    aria-label={t("Quantity to return")}
                    className="ks-input w-full text-center ks-mono"
                    placeholder="0"
                    value={picked[l.shop_product_id] ?? ""}
                    onChange={(e) => setQty(l, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <Field label={t("Refund by")}>
            <div className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className="text-xs font-semibold px-3 py-2 rounded-full border-2"
                  style={method === m ? { borderColor: "var(--accent)", background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" } : { borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  {t(METHOD_LABEL[m])}
                </button>
              ))}
            </div>
          </Field>
          {bill.payment_type === "credit" && (
            <p className="text-xs text-[var(--text-secondary)]">{t("This bill was on udhaar, so the refund reduces what the customer owes.")}</p>
          )}

          <Field label={t("Reason (optional)")}>
            <input className="ks-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. torn pack, wrong item")} />
          </Field>

          <div className="flex items-center justify-between text-sm pt-2 border-t border-[var(--border)]">
            <span className="font-semibold">{t("Refund amount")}</span>
            <span className="ks-mono font-bold text-lg">{rupee(refund)}</span>
          </div>

          {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
          <button disabled={saving || chosen.length === 0 || tooMany} onClick={handleReturn} className="ks-btn-primary w-full flex items-center justify-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t("Return items and refund")}
          </button>
        </div>
      )}
    </Modal>
  );
}
