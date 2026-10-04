"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Copy, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { whatsappLink } from "@/lib/messaging";
import { useT, T } from "@/lib/i18n";
import { rangeFor, statementText, parseISO } from "@/lib/supplies";

const ErrorNote = ({ children }) =>
  children ? <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{children}</p> : null;

// Add or edit a department. Departments are never deleted (their history stays
// correct); "Hide" takes one off the daily round.
export function PointModal({ point, onSave, onClose }) {
  const t = useT();
  const [name, setName] = useState(point?.name || "");
  const [phone, setPhone] = useState(point?.phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(fields) {
    setSaving(true);
    setError("");
    try {
      await onSave(fields);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={point ? t("Edit department") : t("Add department")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Department name")}>
          <input autoFocus className="ks-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. ICU, Ward 3, Pharmacy")} />
        </Field>
        <Field label={t("Phone (optional)")}>
          <input className="ks-input" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button
          disabled={!name.trim() || saving}
          onClick={() => submit({ name: name.trim(), phone: phone.trim() || null })}
          className="ks-btn-primary w-full flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Save")}
        </button>
        {point && (
          <button disabled={saving} onClick={() => submit({ active: !point.active })} className="ks-btn-outline w-full text-sm">
            {point.active ? t("Hide this department") : t("Show this department again")}
          </button>
        )}
      </div>
    </Modal>
  );
}

export function SupplyPaymentModal({ point, onAdd, onClose, today }) {
  const t = useT();
  const [amount, setAmount] = useState(String(Math.max(point.balance, 0)));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = Number(amount) > 0 && paidOn;

  async function add() {
    setSaving(true);
    setError("");
    try {
      await onAdd(point.id, { amount: Number(amount), paid_on: paidOn, method, note: note.trim() });
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Record payment: {name}", { name: point.name })} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Amount received (₹)")}>
          <input autoFocus type="number" inputMode="decimal" className="ks-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("Date")}>
          <input type="date" className="ks-input" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          {[["cash", t("Cash")], ["upi", t("UPI")], ["other", t("Other")]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMethod(id)}
              className={`flex-1 py-2 rounded-xl border text-sm font-semibold ${method === id ? "border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]" : "border-[var(--border)] text-[var(--text-secondary)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Field label={t("Note (optional)")}>
          <input className="ks-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button disabled={!valid || saving} onClick={add} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Record payment")}
        </button>
      </div>
    </Modal>
  );
}

const RANGES = [["today", T("Today")], ["week", T("This week")], ["month", T("This month")], ["lastMonth", T("Last month")]];

// A department's statement for a day, week, month or any dates, with a way to
// send it on WhatsApp.
export function StatementModal({ point, vm, onPay, onClose }) {
  const t = useT();
  const { isOwner } = useShop();
  const { today, loadStatement, activeShop, deletePayment } = vm;
  const [kind, setKind] = useState("month");
  const [range, setRange] = useState(() => rangeFor("month", today));
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setStatement(null);
    setError("");
    if (!range.from || !range.to || range.from > range.to) return undefined;
    loadStatement(point.id, range.from, range.to)
      .then((s) => live && setStatement(s))
      .catch(() => live && setError(t("Couldn't load the statement.")));
    return () => {
      live = false;
    };
  }, [point.id, range.from, range.to, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(k) {
    setKind(k);
    setRange(rangeFor(k, today));
  }

  const text = statement ? statementText({ shopName: activeShop?.name || "", pointName: point.name, statement }) : "";
  const fmt = (iso) => parseISO(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  async function removePayment(id) {
    if (!window.confirm(t("Remove this payment?"))) return;
    try {
      await deletePayment(id);
      setTick((n) => n + 1);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Modal title={t("Statement: {name}", { name: point.name })} onClose={onClose}>
      <div className="space-y-3.5">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => pick(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${kind === k ? "border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]" : "border-[var(--border)] text-[var(--text-secondary)]"}`}
            >
              {t(label)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setKind("custom")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${kind === "custom" ? "border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]" : "border-[var(--border)] text-[var(--text-secondary)]"}`}
          >
            {t("Choose dates")}
          </button>
        </div>
        {kind === "custom" && (
          <div className="flex gap-2">
            <input type="date" aria-label={t("From")} className="ks-input" max={today} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            <input type="date" aria-label={t("To")} className="ks-input" max={today} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>

        {!statement && !error && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 size={14} className="animate-spin" /> {t("Loading…")}</div>
        )}

        {statement && (
          <>
            <div className="rounded-xl bg-[var(--bg-surface-alt)] p-3 space-y-1 text-sm">
              {statement.opening !== 0 && (
                <div className="flex justify-between"><span>{t("Earlier balance")}</span><span className="ks-mono">{rupee(statement.opening)}</span></div>
              )}
              <div className="flex justify-between"><span>{t("Supplied")}</span><span className="ks-mono">{rupee(statement.charged)}</span></div>
              <div className="flex justify-between"><span>{t("Paid")}</span><span className="ks-mono">{rupee(statement.paid)}</span></div>
              <div className="flex justify-between font-bold border-t border-[var(--border)] pt-1 mt-1">
                <span>{t("Balance due")}</span>
                <span className="ks-mono" style={{ color: statement.closing > 0 ? "var(--danger)" : "var(--success)" }}>{rupee(statement.closing)}</span>
              </div>
            </div>

            {statement.items.length > 0 && (
              <div className="text-sm">
                {statement.items.map((it) => (
                  <div key={it.name} className="flex justify-between py-0.5">
                    <span>{it.name} × {it.qty}</span>
                    <span className="ks-mono">{rupee(it.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {statement.days.length === 0 && statement.payments.length === 0 && (
              <p className="text-sm text-[var(--text-secondary)]">{t("Nothing was supplied in this period.")}</p>
            )}

            {statement.days.length > 0 && (
              <div className="text-xs border-t border-[var(--border)] pt-2">
                {statement.days.map((d) => (
                  <div key={d.date} className="flex justify-between gap-3 py-1">
                    <span className="text-[var(--text-secondary)] shrink-0">{fmt(d.date)}</span>
                    <span className="min-w-0 text-right">{d.lines.map((l) => `${l.name} ${l.qty}`).join(", ")}</span>
                    <span className="ks-mono shrink-0">{rupee(d.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {statement.payments.length > 0 && (
              <div className="text-xs border-t border-[var(--border)] pt-2">
                {statement.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-1" style={{ color: "var(--success)" }}>
                    <span>{fmt(p.paid_on)} · {t("Paid")}{p.note ? ` · ${p.note}` : ""}</span>
                    <span className="flex items-center gap-2">
                      <span className="ks-mono">{rupee(p.amount)}</span>
                      {isOwner && (
                        <button type="button" aria-label={t("Remove this payment?")} onClick={() => removePayment(p.id)} className="text-[var(--text-secondary)]">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {point.phone ? (
                <button
                  type="button"
                  onClick={() => window.open(whatsappLink(point.phone, text), "_blank", "noopener,noreferrer")}
                  className="flex-1 text-sm py-2.5 rounded-full font-semibold flex items-center justify-center gap-1.5 text-white"
                  style={{ background: "#25D366" }}
                >
                  <MessageCircle size={14} /> {t("Send on WhatsApp")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(text);
                      setCopied(true);
                    } catch {
                      setError(t("Couldn't copy."));
                    }
                  }}
                  className="flex-1 ks-btn-outline text-sm flex items-center justify-center gap-1.5"
                >
                  <Copy size={14} /> {copied ? t("Copied") : t("Copy")}
                </button>
              )}
              {statement.closing > 0 && (
                <button type="button" onClick={() => onPay(point)} className="flex-1 ks-btn-primary text-sm">{t("Record payment")}</button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
