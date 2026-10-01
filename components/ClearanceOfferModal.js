"use client";

import { useMemo, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { rupee } from "@/lib/format";

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ClearanceOfferModal({ items, suggestedIds = [], initialSelectedIds = [], onClose, onConfirm }) {
  const [name, setName] = useState("Clearance offer");
  const [discountPct, setDiscountPct] = useState("20");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(addDays(todayStr(), 7));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set(initialSelectedIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const suggested = items.filter((i) => suggestedIds.includes(i.id));
  const filtered = query
    ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()) || i.code?.includes(query.trim()))
    : items;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const valid = Number(discountPct) > 0 && Number(discountPct) <= 90 && endDate >= startDate && selected.size > 0;

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm(
        { name: name.trim() || "Clearance offer", discount_pct: Number(discountPct), start_date: startDate, end_date: endDate },
        [...selected]
      );
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="New clearance offer" onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Offer name">
          <input className="ks-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend clearance" />
        </Field>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="Discount %">
            <input type="number" min="1" max="90" className="ks-input" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
          </Field>
          <Field label="Starts">
            <input type="date" className="ks-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Ends">
            <input type="date" className="ks-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

        {suggested.length > 0 && (
          <div className="rounded-xl p-2.5" style={{ background: "var(--warn-soft)" }}>
            <p className="text-[11px] font-bold flex items-center gap-1.5 mb-1.5" style={{ color: "var(--warn)" }}>
              <Sparkles size={12} /> Expiring soon — tap to add
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggested.map((i) => (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  className="text-[11px] font-semibold px-2 py-1 rounded-full border"
                  style={
                    selected.has(i.id)
                      ? { background: "var(--warn-solid)", color: "#fff", borderColor: "var(--warn-solid)" }
                      : { background: "var(--bg-surface)", color: "var(--warn)", borderColor: "var(--warn-solid)" }
                  }
                >
                  {i.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label={`Items (${selected.size} selected)`}>
          <div className="relative mb-1.5">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              placeholder="Search items..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="ks-input text-xs"
              style={{ paddingLeft: "2rem", paddingTop: "0.5rem", paddingBottom: "0.5rem" }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto ks-scroll rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
            {filtered.map((i) => (
              <label key={i.id} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-[var(--bg-surface-alt)]">
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                <span className="flex-1 font-medium">{i.name}</span>
                <span className="ks-mono text-[var(--text-secondary)]">{rupee(i.price)}</span>
              </label>
            ))}
            {filtered.length === 0 && <p className="text-xs text-[var(--text-secondary)] text-center py-4">No items match.</p>}
          </div>
        </Field>

        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button
          disabled={!valid || saving}
          onClick={handleConfirm}
          className="ks-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          Start clearance offer
        </button>
      </div>
    </Modal>
  );
}
