"use client";

import { useRef, useState } from "react";
import { Download, Upload, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, X } from "lucide-react";
import Modal from "@/components/ui/Modal";

import { T, useT } from "@/lib/i18n";
const TEMPLATE_COLS = ["name", "hindi_name", "category", "unit", "price", "cost_price", "gst", "stock", "low_at", "barcode"];
const UNITS = ["pcs", "kg", "g", "l", "ml", "packet"];
const GST_VALS = [0, 5, 12, 18, 28];

const TEMPLATE_CSV = [
  TEMPLATE_COLS.join(","),
  "Sunflower Oil 1L,,Grocery,l,150,110,5,20,5,8901234567890",
  "Tata Salt 1kg,नमक,Grocery,kg,24,18,0,50,10,",
  "Lays Classic,,Snacks,pcs,20,,18,30,10,",
].join("\n");

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
  const rows = lines.slice(1).map((line, idx) => {
    // Simple CSV parse — handles quoted fields
    const fields = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    fields.push(cur.trim());
    const obj = { _row: idx + 2 };
    headers.forEach((h, i) => { obj[h] = fields[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

function validateRow(row, existingCodes) {
  const errors = [];
  if (!row.name?.trim()) errors.push(T("Name is required"));
  const price = Number(row.price);
  if (!row.price || isNaN(price) || price <= 0) errors.push(T("Valid price required"));
  const stock = Number(row.stock);
  if (row.stock === "" || isNaN(stock) || stock < 0) errors.push(T("Valid stock required"));
  if (row.unit && !UNITS.includes(row.unit)) errors.push(T("Unit must be one of: pcs, kg, g, l, ml, packet"));
  if (row.gst !== "" && row.gst !== undefined && !GST_VALS.includes(Number(row.gst))) errors.push(T("GST must be 0, 5, 12, 18 or 28"));
  if (row.cost_price && isNaN(Number(row.cost_price))) errors.push(T("Cost price must be a number"));
  return errors;
}

export default function BulkImportModal({ onClose, onImport, nextCode }) {
  const t = useT();
  const [step, setStep] = useState("upload"); // upload | preview | importing | done
  const [rows, setRows] = useState([]);
  const [validationMap, setValidationMap] = useState({});
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ ok: 0, failed: [] });
  const [fileName, setFileName] = useState("");
  const fileRef = useRef(null);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexper_items_template.csv";
    a.click();
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows: parsed } = parseCSV(ev.target.result);
      const filtered = parsed.filter((r) => r.name?.trim()); // skip blank rows
      const vm = {};
      filtered.forEach((r) => {
        const errs = validateRow(r);
        if (errs.length) vm[r._row] = errs;
      });
      setRows(filtered);
      setValidationMap(vm);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  const validRows = rows.filter((r) => !validationMap[r._row]);
  const invalidRows = rows.filter((r) => validationMap[r._row]);

  async function handleImport() {
    setStep("importing");
    setProgress(0);
    let ok = 0;
    const failed = [];
    // Pre-generate codes: start from nextCode() and pad numerically
    const startCode = parseInt(nextCode(), 10) || 1;
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const code = String(startCode + i).padStart(2, "0");
      try {
        await onImport({
          code,
          name: r.name.trim(),
          hindi_name: r.hindi_name?.trim() || null,
          category: r.category?.trim() || "General",
          unit: UNITS.includes(r.unit) ? r.unit : "pcs",
          price: Number(r.price),
          cost_price: r.cost_price !== "" && r.cost_price !== undefined ? Number(r.cost_price) : null,
          gst: r.gst !== "" && r.gst !== undefined ? Number(r.gst) : null,
          stock: Number(r.stock) || 0,
          low_at: Number(r.low_at) || 5,
          barcode: r.barcode?.trim() || null,
          image_url: null,
        });
        ok++;
      } catch (err) {
        failed.push({ name: r.name, error: err.message });
      }
      setProgress(i + 1);
    }
    setResults({ ok, failed });
    setStep("done");
  }

  return (
    <Modal title={t("Import items from CSV")} onClose={onClose}>
      {/* ── Step: upload ── */}
      {step === "upload" && (
        <div className="space-y-5">
          <div className="rounded-xl p-4 space-y-1" style={{ background: "var(--bg-surface-alt)" }}>
            <p className="text-sm font-semibold">{t("How it works")}</p>
            <ol className="text-sm text-[var(--text-secondary)] space-y-1 list-decimal list-inside">
              <li>{t("Download the template below")}</li>
              <li>{t("Open it in Excel or Google Sheets")}</li>
              <li>{t("Fill in your items (one per row)")}</li>
              <li>{t("Save as CSV and upload here")}</li>
            </ol>
          </div>

          <button onClick={downloadTemplate} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border-2 border-dashed transition-colors" style={{ borderColor: "var(--accent)", color: "var(--accent-soft-text)", background: "var(--accent-soft-bg)" }}>
            <Download size={16} /> {t("Download template (CSV)")}
          </button>

          <div className="text-xs text-[var(--text-secondary)] space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">{t("Required columns:")}</p>
            <p><span className="font-medium text-[var(--danger)]">name</span>, <span className="font-medium text-[var(--danger)]">price</span>, <span className="font-medium text-[var(--danger)]">stock</span></p>
            <p className="font-semibold text-[var(--text-primary)] mt-2">{t("Optional columns:")}</p>
            <p>hindi_name, category, unit, cost_price, gst, low_at, barcode</p>
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className="ks-btn-primary w-full flex items-center justify-center gap-2"
          >
            <Upload size={16} /> {t("Upload your CSV")}
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </div>
      )}

      {/* ── Step: preview ── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={18} style={{ color: "var(--accent-soft-text)" }} />
            <div>
              <p className="text-sm font-semibold truncate">{fileName}</p>
              <p className="text-xs text-[var(--text-secondary)]">{t("{n} rows found", { n: rows.length })}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "var(--success-soft)" }}>
              <p className="text-2xl font-extrabold" style={{ color: "var(--success)" }}>{validRows.length}</p>
              <p className="text-xs font-semibold" style={{ color: "var(--success)" }}>{t("Ready to import")}</p>
            </div>
            <div className="flex-1 rounded-xl p-3 text-center" style={{ background: invalidRows.length ? "var(--danger-soft)" : "var(--bg-surface-alt)" }}>
              <p className="text-2xl font-extrabold" style={{ color: invalidRows.length ? "var(--danger)" : "var(--text-secondary)" }}>{invalidRows.length}</p>
              <p className="text-xs font-semibold" style={{ color: invalidRows.length ? "var(--danger)" : "var(--text-secondary)" }}>{t("Errors")}</p>
            </div>
          </div>

          {invalidRows.length > 0 && (
            <div className="rounded-xl border border-[var(--danger-line)] overflow-hidden">
              <div className="px-3 py-2 text-xs font-bold" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                {t("Rows with errors — fix in your file and re-upload")}
              </div>
              <div className="divide-y divide-[var(--border)] max-h-36 overflow-y-auto ks-scroll">
                {invalidRows.map((r) => (
                  <div key={r._row} className="px-3 py-2">
                    <p className="text-xs font-semibold">{r.name || t("Row {n}", { n: r._row })}</p>
                    <p className="text-[11px] text-[var(--danger)]">{validationMap[r._row].map((e) => t(e)).join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview table of valid rows */}
          {validRows.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="px-3 py-2 text-xs font-bold text-[var(--text-secondary)]" style={{ background: "var(--bg-surface-alt)" }}>
                {t("Preview — first {n} of {total} valid items", { n: Math.min(5, validRows.length), total: validRows.length })}
              </div>
              <div className="divide-y divide-[var(--border)] max-h-40 overflow-y-auto ks-scroll">
                {validRows.slice(0, 5).map((r) => (
                  <div key={r._row} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.name}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">{r.category || "General"} · {r.unit || "pcs"}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="ks-mono font-semibold text-xs">₹{r.price}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">stock {r.stock}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setStep("upload"); setRows([]); setFileName(""); }} className="ks-btn-outline flex-1">
              {t("Re-upload")}
            </button>
            <button
              disabled={validRows.length === 0}
              onClick={handleImport}
              className="ks-btn-primary flex-1 disabled:opacity-40"
            >
              {t("Import {n} items", { n: validRows.length })}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: importing ── */}
      {step === "importing" && (
        <div className="space-y-5 py-4 text-center">
          <Loader2 size={36} className="animate-spin mx-auto" style={{ color: "var(--accent-soft-text)" }} />
          <div>
            <p className="font-semibold">{t("Importing items…")}</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{t("{n} of {total} done", { n: progress, total: validRows.length })}</p>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg-surface-alt)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(progress / validRows.length) * 100}%`, background: "var(--accent)" }}
            />
          </div>
        </div>
      )}

      {/* ── Step: done ── */}
      {step === "done" && (
        <div className="space-y-4">
          <div className="text-center py-2">
            <CheckCircle2 size={44} className="mx-auto mb-3" style={{ color: "var(--success)" }} />
            <p className="text-xl font-extrabold">{t("{n} items imported", { n: results.ok })}</p>
            {results.failed.length > 0 && (
              <p className="text-sm text-[var(--danger)] mt-1">{t("{n} failed", { n: results.failed.length })}</p>
            )}
          </div>
          {results.failed.length > 0 && (
            <div className="rounded-xl border border-[var(--danger-line)] divide-y divide-[var(--danger-line)] max-h-40 overflow-y-auto ks-scroll">
              {results.failed.map((f, i) => (
                <div key={i} className="px-3 py-2">
                  <p className="text-xs font-semibold">{f.name}</p>
                  <p className="text-[11px] text-[var(--danger)]">{f.error}</p>
                </div>
              ))}
            </div>
          )}
          <button onClick={onClose} className="ks-btn-primary w-full">{t("Done")}</button>
        </div>
      )}
    </Modal>
  );
}
