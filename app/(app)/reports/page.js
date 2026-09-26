"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Download, AlertTriangle, FileBarChart2, FileJson } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { fetchShopItems } from "@/lib/products";
import { rupee } from "@/lib/format";
import { computeGstSummary, summaryToCsv, buildGstr1Json, downloadFile } from "@/lib/gstReport";
import ModuleGuard from "@/components/ModuleGuard";
import UpgradePrompt from "@/components/UpgradePrompt";
import { isPro } from "@/lib/pricing";

export default function ReportsPage() {
  return (
    <ModuleGuard module="reports">
      <ReportsPageInner />
    </ModuleGuard>
  );
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthRange(month) {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function ReportsPageInner() {
  const { supabase, activeShopId, activeShop, showToast } = useShop();
  const [tab, setTab] = useState("summary");
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hsnDrafts, setHsnDrafts] = useState({});
  const [savingHsn, setSavingHsn] = useState({});

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const { start, end } = monthRange(month);
    const [itemRows, { data: billRows }] = await Promise.all([
      fetchShopItems(supabase, activeShopId),
      supabase
        .from("bills")
        .select("*")
        .eq("shop_id", activeShopId)
        .gte("date", start.toISOString())
        .lt("date", end.toISOString()),
    ]);
    setItems(itemRows);
    setBills(billRows || []);
    setLoading(false);
  }, [supabase, activeShopId, month]);

  useEffect(() => {
    load();
  }, [load]);

  const itemsBySpId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const summary = useMemo(() => computeGstSummary(bills), [bills]);
  const totals = useMemo(
    () =>
      summary.reduce(
        (a, r) => ({ taxable: a.taxable + r.taxable, tax: a.tax + r.tax, total: a.total + r.total }),
        { taxable: 0, tax: 0, total: 0 }
      ),
    [summary]
  );
  const missingHsn = useMemo(() => items.filter((i) => !i.hsn_code), [items]);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  async function saveHsn(item) {
    const value = (hsnDrafts[item.id] ?? "").trim();
    if (!value) return;
    setSavingHsn((p) => ({ ...p, [item.id]: true }));
    try {
      const { error } = await supabase.from("products").update({ hsn_code: value }).eq("id", item.product_id);
      if (error) throw error;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, hsn_code: value } : i)));
      showToast(`HSN saved for ${item.name}`);
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setSavingHsn((p) => ({ ...p, [item.id]: false }));
    }
  }

  function downloadCsv() {
    downloadFile(`gst-summary-${month}.csv`, summaryToCsv(summary), "text/csv");
  }

  function downloadJson() {
    const [yyyy, mm] = month.split("-");
    const json = buildGstr1Json({ shop: activeShop, bills, itemsBySpId, period: `${mm}${yyyy}` });
    downloadFile(`gstr1-${month}.json`, JSON.stringify(json, null, 2), "application/json");
  }

  return (
    <div className="pt-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="ks-display font-bold text-xl">Reports</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            GST collected on your sales, ready to hand off or file.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="ks-input w-auto"
        />
      </div>

      <div className="inline-flex p-1 rounded-full mb-5" style={{ background: "var(--bg-surface-alt)" }}>
        <button
          onClick={() => setTab("summary")}
          className="px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors"
          style={tab === "summary" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
        >
          <FileBarChart2 size={14} /> Summary report
        </button>
        <button
          onClick={() => setTab("filing")}
          className="px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors"
          style={tab === "filing" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
        >
          <FileJson size={14} /> GST filing export
        </button>
      </div>

      {loading ? (
        <div className="pt-6 flex items-center gap-2 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading {monthLabel} data…
        </div>
      ) : tab === "summary" ? (
        <div className="space-y-4">
          <div className="ks-card p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>What this is:</strong> your GST collected in {monthLabel},
            split by tax slab, with the CGST/SGST halves worked out for you. Use it to fill GSTR-3B by hand or hand the
            numbers to your accountant — no setup needed, works right now.
          </div>

          <div className="ks-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[#6B7280] border-b border-[#E7E9F3]">
                  <th className="px-5 py-3 font-medium">GST Rate</th>
                  <th className="px-5 py-3 font-medium">Taxable value</th>
                  <th className="px-5 py-3 font-medium">CGST</th>
                  <th className="px-5 py-3 font-medium">SGST</th>
                  <th className="px-5 py-3 font-medium">Total tax</th>
                  <th className="px-5 py-3 font-medium">Total sales</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.rate} className="border-b border-[#E7E9F3] last:border-0">
                    <td className="px-5 py-3 font-semibold">{r.rate}%</td>
                    <td className="px-5 py-3 ks-mono">{rupee(r.taxable)}</td>
                    <td className="px-5 py-3 ks-mono">{rupee(r.cgst)}</td>
                    <td className="px-5 py-3 ks-mono">{rupee(r.sgst)}</td>
                    <td className="px-5 py-3 ks-mono">{rupee(r.tax)}</td>
                    <td className="px-5 py-3 ks-mono">{rupee(r.total)}</td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[#6B7280] text-sm">
                      No bills recorded in {monthLabel}.
                    </td>
                  </tr>
                )}
              </tbody>
              {summary.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[#E7E9F3] font-bold">
                    <td className="px-5 py-3">TOTAL</td>
                    <td className="px-5 py-3 ks-mono">{rupee(totals.taxable)}</td>
                    <td className="px-5 py-3 ks-mono" colSpan={2}>
                      {rupee(totals.tax)} tax
                    </td>
                    <td className="px-5 py-3 ks-mono">{rupee(totals.tax)}</td>
                    <td className="px-5 py-3 ks-mono">{rupee(totals.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <button
            onClick={downloadCsv}
            disabled={summary.length === 0}
            className="ks-btn-primary inline-flex items-center gap-2 disabled:opacity-40"
          >
            <Download size={15} /> Download CSV
          </button>
        </div>
      ) : !isPro(activeShop) ? (
        <UpgradePrompt
          feature="GSTR-1 filing export"
          description="The rate-wise summary on the left tab is free. The upload-ready JSON file for the GST Offline Tool is part of SabStore Pro."
        />
      ) : (
        <div className="space-y-4">
          <div className="ks-card p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>What this is:</strong> a GSTR-1 JSON file in the format
            the government&apos;s GST Offline Utility accepts, so you or your CA can upload it instead of retyping every
            invoice. It covers your B2C rate-wise sales and an HSN-wise summary.
            <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-lg" style={{ background: "#FFF4E0", color: "#8A5A00" }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                Best-effort export — GSTN&apos;s schema changes over time, and this assumes every sale is B2C and
                within your own state (no separate buyer GSTIN is captured). Always open the file in the GST Offline
                Tool and check it before filing.
              </span>
            </div>
          </div>

          {!activeShop?.gstin && (
            <div className="ks-card p-4 flex items-start gap-2 text-sm" style={{ color: "#C13F45", background: "#FDEAEA" }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                Your shop&apos;s GSTIN isn&apos;t set. Add it under <strong>Store settings</strong> — the export needs it to
                fill the GSTIN and place-of-supply fields.
              </span>
            </div>
          )}

          {missingHsn.length > 0 && (
            <div className="ks-card p-4">
              <p className="text-sm font-semibold mb-1">
                {missingHsn.length} of {items.length} products are missing an HSN code
              </p>
              <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                The HSN-wise summary section will leave these blank until you add one. Add them here, or when you next
                add/edit an item.
              </p>
              <div className="space-y-2">
                {missingHsn.map((i) => (
                  <div key={i.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm truncate">{i.name}</span>
                    <input
                      className="ks-input ks-mono w-28"
                      placeholder="HSN code"
                      value={hsnDrafts[i.id] ?? ""}
                      onChange={(e) => setHsnDrafts((p) => ({ ...p, [i.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => saveHsn(i)}
                      disabled={!hsnDrafts[i.id]?.trim() || savingHsn[i.id]}
                      className="px-3 py-2 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-40"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {savingHsn[i.id] ? <Loader2 size={13} className="animate-spin" /> : "Save"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={downloadJson}
            disabled={bills.length === 0}
            className="ks-btn-primary inline-flex items-center gap-2 disabled:opacity-40"
          >
            <Download size={15} /> Download GSTR-1 JSON ({monthLabel})
          </button>
        </div>
      )}
    </div>
  );
}
