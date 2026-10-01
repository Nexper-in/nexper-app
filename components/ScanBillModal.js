"use client";

import { callApi } from "@/lib/apiClient";
import { photoToJpeg } from "@/lib/imageResize";
import { matchItem } from "@/lib/matchItems";
import { useRef, useState } from "react";
import { X, Camera, Upload, Loader2, CheckCircle2, AlertTriangle, ChevronRight, RotateCcw } from "lucide-react";
import { rupee } from "@/lib/format";

import { useT } from "@/lib/i18n";
const STEP = { CAPTURE: "capture", ANALYZING: "analyzing", REVIEW: "review", DONE: "done" };

export default function ScanBillModal({ items, supabase, activeShopId, showToast, onClose, onDone }) {
  const t = useT();
  const fileRef = useRef(null);
  const [step, setStep] = useState(STEP.CAPTURE);
  const [preview, setPreview] = useState(null);
  const [imageData, setImageData] = useState(null); // { base64, mediaType }
  const [billMeta, setBillMeta] = useState(null); // { supplier, invoice_date, invoice_no }
  const [rows, setRows] = useState([]); // enriched extracted items
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const photo = await photoToJpeg(file);
      setPreview(photo.dataUrl);
      setImageData({ base64: photo.base64, mediaType: photo.mediaType });
    } catch (err) {
      setError(err.message);
    }
  }

  async function analyze() {
    if (!imageData) return;
    setStep(STEP.ANALYZING);
    setError(null);
    try {
      let data;
      try {
        data = await callApi(supabase, "/api/scan-supplier-bill", { image: imageData.base64, mediaType: imageData.mediaType });
      } catch (err) {
        setError(err.message || "Something went wrong — please try again.");
        setStep(STEP.CAPTURE);
        return;
      }
      setBillMeta({ supplier: data.supplier, invoice_date: data.invoice_date, invoice_no: data.invoice_no });
      // Build review rows — each extracted item gets a match attempt
      const enriched = (data.items || []).map((item) => ({
        ...item,
        qty: item.qty ?? 1,
        unit: item.unit || "pcs",
        matched: matchItem(item.name, items) || null,
        include: true,
      }));
      setRows(enriched);
      setStep(STEP.REVIEW);
    } catch {
      setError(t("Network error — check your connection and try again."));
      setStep(STEP.CAPTURE);
    }
  }

  function updateRow(idx, patch) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function applyToInventory() {
    const toApply = rows.filter((r) => r.include && r.matched);
    if (toApply.length === 0) {
      showToast(t("No matched items to apply — link items to your inventory first"), "warn");
      return;
    }
    setApplying(true);
    let done = 0;
    let failed = 0;
    for (const row of toApply) {
      const { error } = await supabase.rpc("adjust_stock", {
        p_shop_id: activeShopId,
        p_shop_product_id: row.matched.id,
        p_type: "in",
        p_qty: Number(row.qty),
        p_reason: `Supplier bill${billMeta?.supplier ? ` — ${billMeta.supplier}` : ""}${billMeta?.invoice_no ? ` #${billMeta.invoice_no}` : ""}`,
        p_supplier: billMeta?.supplier || null,
        p_expiry_date: null,
      });
      if (error) failed++;
      else done++;
    }
    setApplying(false);
    if (failed > 0) showToast(t("{done} items updated · {failed} failed", { done, failed }), "warn");
    else showToast(`${done} item${done === 1 ? "" : "s"} added to inventory`);
    setStep(STEP.DONE);
    onDone?.();
  }

  const matchedCount = rows.filter((r) => r.include && r.matched).length;
  const unmatchedCount = rows.filter((r) => r.include && !r.matched).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div
        className="ks-card w-full sm:max-w-xl flex flex-col rounded-t-3xl sm:rounded-2xl"
        style={{ background: "var(--bg-surface)", maxHeight: "92dvh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 className="ks-display font-bold">{t("Scan supplier bill")}</h2>
            {billMeta?.supplier && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{billMeta.supplier}{billMeta.invoice_date ? ` · ${billMeta.invoice_date}` : ""}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 ks-scroll">
          {/* CAPTURE STEP */}
          {(step === STEP.CAPTURE || step === STEP.ANALYZING) && (
            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-medium" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                  <AlertTriangle size={15} className="shrink-0" />
                  {error}
                </div>
              )}

              {/* Image preview / placeholder */}
              {preview ? (
                <div className="relative rounded-2xl overflow-hidden border border-[var(--border)]" style={{ maxHeight: 280 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Bill preview" className="w-full object-contain" style={{ maxHeight: 280 }} />
                  <button
                    onClick={() => { setPreview(null); setImageData(null); fileRef.current.value = ""; }}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full"
                    style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-10"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Camera size={36} style={{ color: "var(--accent)" }} />
                  <div className="text-center">
                    <p className="font-semibold text-sm">{t("Take a photo of the supplier bill")}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{t("Or tap to upload from gallery")}</p>
                  </div>
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFileChange}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="ks-btn-outline flex items-center justify-center gap-1.5 flex-1"
                >
                  <Upload size={14} /> {preview ? "Retake / change" : "Upload image"}
                </button>
                <button
                  onClick={analyze}
                  disabled={!imageData || step === STEP.ANALYZING}
                  className="ks-btn-primary flex items-center justify-center gap-1.5 flex-1 disabled:opacity-40"
                >
                  {step === STEP.ANALYZING ? (
                    <><Loader2 size={14} className="animate-spin" /> {t("Analyzing…")}</>
                  ) : (
                    <>Analyze bill <ChevronRight size={14} /></>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-[var(--text-secondary)] text-center">
                {t("Works with printed bills, handwritten chalans, and Hindi/English bills. Keep the text in frame and well-lit.")}
              </p>
            </div>
          )}

          {/* REVIEW STEP */}
          {step === STEP.REVIEW && (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--accent-soft-text)]">{t("{n} matched", { n: matchedCount })}</span>
                {unmatchedCount > 0 && <><span>·</span><span className="text-[var(--danger)] font-semibold">{t("{n} unmatched", { n: unmatchedCount })}</span></>}
                <span>· {t("{n} items found on bill", { n: rows.length })}</span>
              </div>

              <div className="space-y-2">
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border p-3"
                    style={{
                      borderColor: !row.include ? "var(--border)" : row.matched ? "var(--accent)" : "var(--danger-line)",
                      background: !row.include ? "var(--bg-surface-alt)" : row.matched ? "var(--accent-soft-bg)" : "var(--danger-soft)",
                      opacity: row.include ? 1 : 0.6,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => updateRow(idx, { include: e.target.checked })}
                        className="mt-0.5 accent-[#4F46E5]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{row.name}</span>
                          <span className="ks-mono text-xs text-[var(--text-secondary)] shrink-0">
                            ×{row.qty} {row.unit}
                            {row.price_per_unit != null && ` @ ${rupee(row.price_per_unit)}`}
                            {row.total != null && ` = ${rupee(row.total)}`}
                          </span>
                        </div>

                        {/* Inventory match selector */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[11px] text-[var(--text-secondary)] shrink-0">{t("→ Inventory item:")}</span>
                          <select
                            value={row.matched?.id || ""}
                            onChange={(e) => {
                              const inv = items.find((i) => i.id === e.target.value) || null;
                              updateRow(idx, { matched: inv });
                            }}
                            className="text-xs flex-1 rounded-lg border border-[var(--border)] px-2 py-1"
                            style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
                          >
                            <option value="">{t("— not in inventory (skip)")}</option>
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name} (stock: {i.stock} {i.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Qty override */}
                        {row.include && row.matched && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[11px] text-[var(--text-secondary)] shrink-0">{t("Qty to add:")}</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.qty}
                              onChange={(e) => updateRow(idx, { qty: e.target.value })}
                              className="ks-mono text-xs w-24 rounded-lg border border-[var(--border)] px-2 py-1"
                              style={{ background: "var(--bg-surface)" }}
                            />
                            <span className="text-[11px] text-[var(--text-secondary)]">{row.matched.unit}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {unmatchedCount > 0 && (
                <p className="text-[11px] text-[var(--text-secondary)] bg-[var(--warn-soft)] rounded-lg px-3 py-2">
                  ⚠️ {t("{n} not matched to your inventory. Add them to inventory first, then re-scan, or use the dropdown above to link them manually.", { n: unmatchedCount })}
                </p>
              )}
            </div>
          )}

          {/* DONE STEP */}
          {step === STEP.DONE && (
            <div className="p-8 flex flex-col items-center text-center gap-3">
              <CheckCircle2 size={40} style={{ color: "var(--accent-soft-text)" }} />
              <h3 className="ks-display font-bold text-lg">{t("Inventory updated!")}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{t("Stock has been added for {n} items.", { n: matchedCount })}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
          {step === STEP.REVIEW && (
            <button
              onClick={applyToInventory}
              disabled={applying || matchedCount === 0}
              className="ks-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {applying ? (
                <><Loader2 size={15} className="animate-spin" /> {t("Updating inventory…")}</>
              ) : (
                t("Add stock for {n} items", { n: matchedCount })
              )}
            </button>
          )}
          {step === STEP.DONE && (
            <button onClick={onClose} className="ks-btn-primary w-full">{t("Done")}</button>
          )}
          {(step === STEP.CAPTURE || step === STEP.ANALYZING) && (
            <button onClick={onClose} className="ks-btn-outline w-full">{t("Cancel")}</button>
          )}
        </div>
      </div>
    </div>
  );
}
