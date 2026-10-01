"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, ScanLine, ChevronDown, Lock } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { nextCode } from "@/lib/inventoryHelpers";
import { useShop } from "@/components/ShopContext";
import { hasFeature } from "@/lib/platformConfig";

import { useT } from "@/lib/i18n";
export default function AddItemModal({ items, onClose, onAdd }) {
  const t = useT();
  const { activeShop } = useShop();
  const pro = hasFeature(activeShop, "product_photos");
  const [form, setForm] = useState({
    name: "",
    hindi_name: "",
    category: "",
    unit: "pcs",
    price: "",
    mrp: "",
    cost_price: "",
    gst: "",
    hsn_code: "",
    stock: "1",
    low_at: "5",
    code: nextCode(items),
    image_url: "",
    barcode: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [listeningField, setListeningField] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  // quickMode = true after a barcode scan finds a product — shows compact price-entry view
  const [quickMode, setQuickMode] = useState(false);
  const priceRef = useRef(null);
  const recogRef = useRef(null);
  const valid = form.name.trim() && form.price !== "" && form.stock !== "" && /^\d{2}$/.test(form.code);

  // Auto-focus the price field when quick mode activates
  useEffect(() => {
    if (quickMode && priceRef.current) {
      setTimeout(() => priceRef.current?.focus(), 80);
    }
  }, [quickMode]);

  function startScan() {
    if (!("BarcodeDetector" in window)) {
      alert(t("Barcode scanner not supported in this browser. Please type the barcode manually."));
      return;
    }
    setScanning(true);
    let active = true;
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((stream) => {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.play();
      const interval = setInterval(async () => {
        if (!active) return;
        try {
          const [result] = await detector.detect(video);
          if (result) {
            clearInterval(interval);
            stream.getTracks().forEach((track) => track.stop());
            active = false;
            setScanning(false);
            const val = result.rawValue;
            setForm((prev) => ({ ...prev, barcode: val }));
            lookupByBarcode(val, true);
          }
        } catch { /* no code found yet */ }
      }, 400);
      setTimeout(() => {
        if (active) {
          clearInterval(interval);
          stream.getTracks().forEach((track) => track.stop());
          active = false;
          setScanning(false);
        }
      }, 30000);
    }).catch(() => setScanning(false));
  }

  async function lookupByBarcode(barcode, fromScan = false) {
    setLookingUp(true);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,image_front_small_url`);
      const json = await res.json();
      if (json.status === 1 && json.product?.product_name) {
        const p = json.product;
        setForm((prev) => ({
          ...prev,
          name: prev.name || p.product_name,
          image_url: prev.image_url || p.image_front_small_url || "",
        }));
        if (fromScan) setQuickMode(true);
      }
    } catch { /* ignore */ } finally {
      setLookingUp(false);
    }
  }

  function startVoice(field) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (recogRef.current) { recogRef.current.abort(); recogRef.current = null; }
    if (listeningField === field) { setListeningField(null); return; }
    const r = new SR();
    r.lang = field === "hindi_name" ? "hi-IN" : "en-IN";
    r.interimResults = false;
    r.maxAlternatives = 1;
    recogRef.current = r;
    setListeningField(field);
    r.onresult = (e) => {
      setForm((prev) => ({ ...prev, [field]: e.results[0][0].transcript.trim() }));
      setListeningField(null);
      recogRef.current = null;
    };
    r.onerror = () => { setListeningField(null); recogRef.current = null; };
    r.onend = () => { setListeningField(null); recogRef.current = null; };
    r.start();
  }

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      await onAdd({
        code: form.code.padStart(2, "0"),
        name: form.name.trim(),
        hindi_name: form.hindi_name.trim() || null,
        image_url: form.image_url.trim() || null,
        barcode: form.barcode.trim() || null,
        category: form.category.trim() || "General",
        unit: form.unit,
        price: Number(form.price),
        mrp: form.mrp !== "" ? Number(form.mrp) : null,
        cost_price: form.cost_price !== "" ? Number(form.cost_price) : null,
        gst: form.gst !== "" ? Number(form.gst) : null,
        hsn_code: form.hsn_code.trim() || null,
        stock: Number(form.stock),
        low_at: Number(form.low_at) || 5,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  // ── Quick mode: compact view shown right after a successful barcode scan ──
  if (quickMode) {
    return (
      <Modal title={t("Set selling price")} onClose={onClose}>
        <div className="space-y-4">
          {/* Product preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--bg-surface-alt)" }}>
            {form.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.image_url}
                alt=""
                className="w-14 h-14 rounded-lg object-cover shrink-0"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">{form.name}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 ks-mono">{form.barcode}</p>
            </div>
          </div>

          {/* Price — auto-focused */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Selling price (₹)")}>
              <input
                ref={priceRef}
                type="number"
                className="ks-input text-lg font-semibold"
                placeholder="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </Field>
            <Field label={t("MRP (₹, optional)")}>
              <input
                type="number"
                className="ks-input"
                placeholder={t("Shows as a discount")}
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              />
            </Field>
          </div>

          {/* Stock — defaults to 1 */}
          <Field label={t("Opening stock")}>
            <input
              type="number"
              className="ks-input"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </Field>

          {error && (
            <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            disabled={!valid || saving}
            onClick={handleAdd}
            className="ks-btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t("Add to inventory")}
          </button>

          {/* Escape hatch to full form */}
          <button
            type="button"
            onClick={() => setQuickMode(false)}
            className="w-full text-xs text-[var(--text-secondary)] flex items-center justify-center gap-1 pt-1"
          >
            <ChevronDown size={13} /> {t("More details (category, GST, Hindi name…)")}
          </button>
        </div>
      </Modal>
    );
  }

  // ── Full form ──
  return (
    <Modal title={t("Add new item")} onClose={onClose}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("Code")}>
            <input
              className="ks-input ks-mono text-center"
              maxLength={2}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "").slice(0, 2) })}
            />
          </Field>
          <div className="col-span-2">
            <Field label={t("Item name")}>
              <div className="relative">
                <input
                  className="ks-input"
                  style={{ paddingRight: "2.5rem" }}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("Type or speak")}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => startVoice("name")}
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${listeningField === "name" ? "ks-pulse" : ""}`}
                  style={{ background: listeningField === "name" ? "var(--danger-solid)" : "var(--bg-surface-alt)", color: listeningField === "name" ? "#fff" : "var(--text-secondary)" }}
                  title={t("Speak item name")}
                >
                  <Mic size={13} />
                </button>
              </div>
            </Field>
          </div>
        </div>

        <Field label={t("Barcode")}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className="ks-input ks-mono"
                value={form.barcode}
                onChange={(e) => {
                  setForm({ ...form, barcode: e.target.value });
                  if (e.target.value.length >= 8) lookupByBarcode(e.target.value);
                }}
                placeholder={t("Scan the product or type barcode")}
              />
              {lookingUp && (
                <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "var(--accent-soft-text)" }} />
              )}
            </div>
            <button
              type="button"
              onClick={startScan}
              className={`shrink-0 px-3 h-10 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors ${scanning ? "ks-pulse" : ""}`}
              style={{ background: scanning ? "var(--accent)" : "var(--bg-surface-alt)", color: scanning ? "#fff" : "var(--accent-soft-text)" }}
              title={t("Scan barcode with camera")}
            >
              <ScanLine size={15} />
              {scanning ? "Scanning…" : "Scan"}
            </button>
          </div>
          {lookingUp && <p className="text-xs text-[var(--accent-soft-text)] mt-1">{t("Looking up product…")}</p>}
        </Field>

        <Field label={t("Hindi / local name (optional)")}>
          <div className="relative">
            <input
              className="ks-input"
              style={{ paddingRight: "2.5rem" }}
              value={form.hindi_name}
              onChange={(e) => setForm({ ...form, hindi_name: e.target.value })}
              placeholder={t("e.g. चीनी — tap mic to speak in Hindi")}
            />
            <button
              type="button"
              onClick={() => startVoice("hindi_name")}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${listeningField === "hindi_name" ? "ks-pulse" : ""}`}
              style={{ background: listeningField === "hindi_name" ? "var(--accent)" : "var(--bg-surface-alt)", color: listeningField === "hindi_name" ? "#fff" : "var(--text-secondary)" }}
              title="बोलकर हिंदी नाम भरें"
            >
              <Mic size={13} />
            </button>
          </div>
        </Field>

        <Field label={
          <span className="flex items-center gap-1.5">
            {t("Photo URL (optional)")}
            {!pro && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>
                <Lock size={9} /> {t("PRO")}
              </span>
            )}
          </span>
        }>
          {pro ? (
            <div className="flex items-center gap-2.5">
              {form.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.image_url}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              )}
              <input
                className="ks-input"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder={t("Paste an image link")}
              />
            </div>
          ) : (
            <input className="ks-input opacity-50 cursor-not-allowed" disabled placeholder={t("Upgrade to Pro to add product photos")} />
          )}
        </Field>

        <Field label={t("Category")}>
          <input
            className="ks-input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder={t("e.g. Grocery")}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Unit")}>
            <select className="ks-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {["pcs", "kg", "g", "l", "ml", "packet"].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Selling price (₹)")}>
            <input type="number" className="ks-input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("MRP (₹, optional)")}>
            <input
              type="number"
              className="ks-input"
              placeholder={t("Shown struck through as a discount")}
              value={form.mrp}
              onChange={(e) => setForm({ ...form, mrp: e.target.value })}
            />
          </Field>
          <Field label={t("Purchase price (₹, optional)")}>
            <input
              type="number"
              className="ks-input"
              value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("GST % (optional)")}>
            <select className="ks-input" value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })}>
              <option value="">{t("None")}</option>
              {[0, 5, 12, 18, 28].map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </select>
          </Field>
          <Field label={t("HSN code (optional)")}>
            <input
              className="ks-input ks-mono"
              value={form.hsn_code}
              onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
              placeholder="e.g. 1701"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Opening stock")}>
            <input type="number" className="ks-input" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </Field>
          <Field label={t("Low stock alert at")}>
            <input type="number" className="ks-input" value={form.low_at} onChange={(e) => setForm({ ...form, low_at: e.target.value })} />
          </Field>
        </div>

        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleAdd} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Add item")}
        </button>
      </div>
    </Modal>
  );
}
