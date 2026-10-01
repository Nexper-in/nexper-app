"use client";

import { useMemo, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Search, BookOpen } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { CATALOG_CATEGORIES, INDIAN_CATALOG } from "@/lib/indianCatalog";

export default function CatalogPickerModal({ onClose, onImport, nextCode }) {
  const [step, setStep] = useState("browse"); // browse | price | importing | done
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(() => new Set());
  const [prices, setPrices] = useState({}); // name -> { price, stock }
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ ok: 0, failed: [] });

  const filtered = useMemo(
    () =>
      INDIAN_CATALOG.filter(
        (i) =>
          (category === "All" || i.category === category) &&
          (query.trim() === "" || i.name.toLowerCase().includes(query.trim().toLowerCase()))
      ),
    [query, category]
  );

  const selectedItems = useMemo(() => INDIAN_CATALOG.filter((i) => selected.has(i.name)), [selected]);

  function toggle(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function goToPricing() {
    setPrices((prev) => {
      const next = { ...prev };
      selectedItems.forEach((i) => {
        if (!next[i.name]) next[i.name] = { price: "", stock: "1" };
      });
      return next;
    });
    setStep("price");
  }

  const readyToImport = selectedItems.every((i) => Number(prices[i.name]?.price) > 0);

  async function handleImport() {
    setStep("importing");
    setProgress(0);
    let ok = 0;
    const failed = [];
    const startCode = parseInt(nextCode(), 10) || 1;
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      const draft = prices[item.name];
      const code = String(startCode + i).padStart(2, "0");
      try {
        await onImport({
          code,
          name: item.name,
          hindi_name: item.hindi_name || null,
          category: item.category,
          unit: item.unit,
          hsn_code: item.hsn_code || null,
          price: Number(draft.price),
          cost_price: null,
          gst: item.gst,
          stock: Number(draft.stock) || 0,
          low_at: 5,
          barcode: null,
          image_url: null,
        });
        ok++;
      } catch (err) {
        failed.push({ name: item.name, error: err.message });
      }
      setProgress(i + 1);
    }
    setResults({ ok, failed });
    setStep("done");
  }

  if (step === "importing") {
    return (
      <Modal title="Adding items…">
        <div className="py-6 flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
          <p className="text-sm font-semibold">
            {progress} / {selectedItems.length}
          </p>
        </div>
      </Modal>
    );
  }

  if (step === "done") {
    return (
      <Modal title="Import complete" onClose={onClose}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--success)" }}>
            <CheckCircle2 size={16} /> {results.ok} item{results.ok === 1 ? "" : "s"} added to inventory
          </div>
          {results.failed.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--danger)" }}>
                <AlertCircle size={13} /> {results.failed.length} failed
              </p>
              {results.failed.map((f, i) => (
                <p key={i} className="text-xs pl-4" style={{ color: "var(--text-secondary)" }}>
                  {f.name} — {f.error}
                </p>
              ))}
            </div>
          )}
          <button onClick={onClose} className="ks-btn-primary w-full mt-2">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  if (step === "price") {
    return (
      <Modal title={`Set prices — ${selectedItems.length} items`} onClose={() => setStep("browse")}>
        <div className="space-y-3">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Set your selling price for each item. Opening stock defaults to 1 — adjust if you're stocking more.
          </p>
          <div className="space-y-2.5 max-h-96 overflow-y-auto ks-scroll pr-1">
            {selectedItems.map((i) => (
              <div key={i.name} className="flex items-center gap-2">
                <span className="flex-1 text-xs font-semibold truncate">{i.name}</span>
                <input
                  type="number"
                  className="ks-input text-sm w-20 py-1.5"
                  placeholder="Price ₹"
                  value={prices[i.name]?.price ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [i.name]: { ...p[i.name], price: e.target.value } }))}
                />
                <input
                  type="number"
                  className="ks-input text-sm w-16 py-1.5"
                  placeholder="Stock"
                  value={prices[i.name]?.stock ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [i.name]: { ...p[i.name], stock: e.target.value } }))}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setStep("browse")} className="ks-btn-outline flex-1">
              Back
            </button>
            <button onClick={handleImport} disabled={!readyToImport} className="ks-btn-primary flex-1 disabled:opacity-40">
              Add {selectedItems.length} items
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── browse ──
  return (
    <Modal title="Import from catalog" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <BookOpen size={13} className="shrink-0 mt-0.5" />
          Pick common items to add instantly with category, unit and GST/HSN prefilled — rates shown are indicative,
          double-check them for your actual products.
        </p>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            placeholder="Search catalog..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ks-input py-2"
            style={{ paddingLeft: "2rem" }}
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto ks-scroll pb-1">
          {["All", ...CATALOG_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors"
              style={
                category === c
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }
              }
            >
              {c}
            </button>
          ))}
        </div>

        <div className="max-h-72 overflow-y-auto ks-scroll space-y-1">
          {filtered.map((i) => (
            <label
              key={i.name}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer"
              style={selected.has(i.name) ? { background: "var(--accent-soft-bg)" } : {}}
            >
              <input type="checkbox" checked={selected.has(i.name)} onChange={() => toggle(i.name)} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{i.name}</p>
                <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  {i.category}
                </p>
              </div>
              <span className="ks-mono text-[10px] shrink-0" style={{ color: "var(--text-secondary)" }}>
                {i.gst}% GST
              </span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-center py-6" style={{ color: "var(--text-secondary)" }}>
              No catalog items match &quot;{query}&quot;.
            </p>
          )}
        </div>

        <button
          onClick={goToPricing}
          disabled={selected.size === 0}
          className="ks-btn-primary w-full disabled:opacity-40"
        >
          Continue with {selected.size} selected
        </button>
      </div>
    </Modal>
  );
}
