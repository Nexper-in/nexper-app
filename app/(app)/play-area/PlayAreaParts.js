"use client";

import { useState } from "react";
import { Loader2, Search, X, Plus, Minus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { useT } from "@/lib/i18n";
import { rupee } from "@/lib/format";

// Shared between the Play area screen and the "Play area" picker on New bill
// (see app/(app)/billing/BillingParts.js), so a station added or edited from
// either place looks and behaves the same.

export function clock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function StationModal({ station, types, onSave, onDelete, onClose }) {
  const t = useT();
  const [name, setName] = useState(station?.name || "");
  const [type, setType] = useState(station?.type || "carrom");
  const [rate, setRate] = useState(station ? String(station.hourly_rate) : "");
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

  async function del() {
    if (!window.confirm(t("Delete this station? This can't be undone."))) return;
    setSaving(true);
    setError("");
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const rateNum = parseFloat(rate);
  const valid = name.trim().length > 0 && rateNum >= 0 && rateNum <= 100000;

  return (
    <Modal title={station ? t("Edit station") : t("Add station")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Station name")}>
          <input autoFocus className="ks-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Carrom Table 1")} />
        </Field>
        <Field label={t("Station type")}>
          <select className="ks-input" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((ty) => (
              <option key={ty.id} value={ty.id}>{t(ty.label)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("Rate per hour (₹)")}>
          <input className="ks-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="50" />
        </Field>
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button
          disabled={!valid || saving}
          onClick={() => submit({ name: name.trim(), type, hourly_rate: Math.round(rateNum * 100) / 100 })}
          className="ks-btn-primary w-full flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Save")}
        </button>
        {station && (
          <>
            <button disabled={saving} onClick={() => submit({ active: !station.active })} className="ks-btn-outline w-full text-sm">
              {station.active ? t("Hide this station") : t("Show this station again")}
            </button>
            <button disabled={saving} onClick={del} className="w-full text-sm py-2.5 rounded-xl font-semibold" style={{ color: "var(--danger)" }}>
              {t("Delete this station")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

// Tags one player under a running table (migration 051) -- name only, or
// name and phone, so an order can be rung up against them by name.
export function AddPlayerModal({ onSave, onClose }) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSave({ name, phone });
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const valid = name.trim().length > 0;

  return (
    <Modal title={t("Add player")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Name")}>
          <input autoFocus className="ks-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Rahul")} />
        </Field>
        <Field label={t("Phone number (optional)")}>
          <input className="ks-input" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
        </Field>
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button disabled={!valid || saving} onClick={submit} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Add")}
        </button>
      </div>
    </Modal>
  );
}

// Rings up one item against a player (or "Shared", for something like a jug
// of water the whole table drinks from) while the game is still running.
// Tapping an item already on that player's tab just adds one more to it,
// same as the quick tiles on New bill.
export function OrderPickerModal({ players, orders, items, onAddOrder, onRemoveOrder, onDecrementOrder, onClose }) {
  const t = useT();
  const [playerId, setPlayerId] = useState(null); // null = shared
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const results = query.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : items.slice(0, 20);
  const tabLines = orders.filter((o) => (o.player_id || null) === playerId);
  const tabTotal = tabLines.reduce((s, o) => s + Number(o.qty) * Number(o.price), 0);
  // One order per item, per player -- so the item list below can show each
  // item's own running count and a +/- right on its row (how many cigarettes,
  // teas and samosas Sam has, each adjusted on the spot, not by counting taps).
  const lineFor = (itemId) => tabLines.find((o) => o.shop_product_id === itemId);

  async function add(item) {
    setBusy(true);
    try {
      await onAddOrder(playerId, item);
    } catch (e) {
      // addOrder/removeOrder already surface their own toast on failure
    }
    setBusy(false);
  }

  async function dec(line) {
    setBusy(true);
    try {
      await onDecrementOrder(line.id);
    } catch (e) {
      // decrementOrder already surfaces its own toast on failure
    }
    setBusy(false);
  }

  return (
    <Modal title={t("Add order")} onClose={onClose}>
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-1 px-1">
        <button
          onClick={() => setPlayerId(null)}
          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={playerId === null ? { background: "var(--strong)", color: "var(--on-strong)" } : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
        >
          {t("Shared")}
        </button>
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlayerId(p.id)}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full truncate max-w-[9rem]"
            style={playerId === p.id ? { background: "var(--strong)", color: "var(--on-strong)" } : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} />
        <input
          className="ks-input"
          style={{ paddingLeft: "2.25rem" }}
          placeholder={t("Search item")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="space-y-1.5 max-h-56 overflow-y-auto ks-scroll mb-3">
        {results.map((item) => {
          const line = lineFor(item.id);
          const qty = line ? Number(line.qty) : 0;
          return (
            <div key={item.id} className="ks-card flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug truncate">{item.name}</p>
                <p className="ks-mono text-xs font-bold mt-0.5" style={{ color: "var(--accent-soft-text)" }}>{rupee(item.price)}</p>
              </div>
              {qty > 0 ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" disabled={busy} onClick={() => dec(line)} className="ks-qtybtn" aria-label={t("One less {name}", { name: item.name })} style={{ width: 28, height: 28 }}>
                    <Minus size={13} />
                  </button>
                  <span className="ks-mono text-sm font-semibold w-5 text-center">{qty}</span>
                  <button type="button" disabled={busy} onClick={() => add(item)} className="ks-qtybtn" aria-label={t("One more {name}", { name: item.name })} style={{ width: 28, height: 28 }}>
                    <Plus size={13} />
                  </button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => add(item)} className="ks-qtybtn shrink-0" aria-label={t("One more {name}", { name: item.name })} style={{ width: 28, height: 28 }}>
                  <Plus size={13} />
                </button>
              )}
            </div>
          );
        })}
        {results.length === 0 && (
          <p className="text-sm text-center py-6" style={{ color: "var(--text-secondary)" }}>{t("No item called \"{q}\"", { q: query })}</p>
        )}
      </div>

      {tabLines.length > 0 && (
        <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
            {playerId === null ? t("Shared so far") : t("{name}'s order so far", { name: players.find((p) => p.id === playerId)?.name || "" })}
          </p>
          <div className="space-y-1.5">
            {tabLines.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <span className="text-sm flex-1 truncate">{o.name}{o.qty > 1 ? ` ×${o.qty}` : ""}</span>
                <span className="ks-mono text-sm font-semibold shrink-0">{rupee(o.qty * o.price)}</span>
                <button onClick={() => onRemoveOrder(o.id)} className="ks-qtybtn shrink-0" aria-label={t("Remove {name}", { name: o.name })} style={{ width: 26, height: 26 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <p className="text-right text-sm font-bold pt-1">{rupee(tabTotal)}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
