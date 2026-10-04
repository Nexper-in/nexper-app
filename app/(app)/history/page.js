"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { Printer, MessageCircle, Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { billMessageText, whatsappLink } from "@/lib/messaging";
import PrintBillContent from "@/components/PrintBillContent";
import ModuleGuard from "@/components/ModuleGuard";

import { useT } from "@/lib/i18n";
export default function HistoryPage() {
  return (
    <ModuleGuard module="history">
      <HistoryPageInner />
    </ModuleGuard>
  );
}

function HistoryPageInner() {
  const t = useT();
  const { supabase, activeShopId, activeShop } = useShop();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(null);
  const [printing, setPrinting] = useState(null);

  // Newest bills first, 100 at a time: a shop with years of bills should not
  // download all of them just to look at today's.
  const PAGE = 100;
  const loadPage = useCallback(
    async (from) => {
      const { data } = await supabase
        .from("bills")
        .select("*")
        .eq("shop_id", activeShopId)
        .order("date", { ascending: false })
        .order("id")
        .range(from, from + PAGE - 1);
      return data || [];
    },
    [supabase, activeShopId]
  );

  useEffect(() => {
    if (!activeShopId) return;
    setLoading(true);
    loadPage(0).then((rows) => {
      setBills(rows);
      setHasMore(rows.length === PAGE);
      setLoading(false);
    });
  }, [activeShopId, loadPage]);

  async function showOlder() {
    setLoadingMore(true);
    const rows = await loadPage(bills.length);
    setBills((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE);
    setLoadingMore(false);
  }

  function doPrint(bill) {
    setPrinting(bill);
    setTimeout(() => window.print(), 50);
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading history…")}
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="ks-card overflow-hidden overflow-x-auto">
        <table className="ks-stack w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium">{t("Bill No.")}</th>
              <th className="px-5 py-3 font-medium">{t("Date")}</th>
              <th className="px-5 py-3 font-medium">{t("Customer")}</th>
              <th className="px-5 py-3 font-medium">{t("Items")}</th>
              <th className="px-5 py-3 font-medium">{t("Total")}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <Fragment key={b.id}>
                <tr className="border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg-surface-alt)]" onClick={() => setOpen(open === b.id ? null : b.id)}>
                  <td className="px-5 py-3 ks-mono font-bold">{b.bill_no}</td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">{new Date(b.date).toLocaleString("en-IN")}</td>
                  <td className="px-5 py-3">
                    {b.customer_name || "—"}
                    {b.payment_type === "credit" && (
                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--udhaar-soft)", color: "var(--udhaar)" }}>
                        {t("UDHAAR")}
                      </span>
                    )}
                    {b.payment_type !== "credit" && b.payment_method && b.payment_method !== "cash" && (
                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}>
                        {b.payment_method.toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">{(b.items || []).length}</td>
                  <td className="px-5 py-3 ks-mono font-bold">{rupee(b.total)}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          doPrint(b);
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1"
                        style={{ background: "var(--bg-surface-alt)", color: "var(--text-primary)" }}
                      >
                        <Printer size={13} /> {t("Print")}
                      </button>
                      {b.customer_phone && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(whatsappLink(b.customer_phone, billMessageText(b, activeShop?.name, activeShop?.gstin, activeShop?.whatsapp_group_url)), "_blank", "noopener,noreferrer");
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1 text-white"
                          style={{ background: "#25D366" }}
                        >
                          <MessageCircle size={13} /> {t("Send")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {open === b.id && (
                  <tr className="bg-[var(--bg-surface-alt)] border-b border-[var(--border)]">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="space-y-1.5">
                        {(b.items || []).map((it, idx) => (
                          <div key={it.shop_product_id || idx} className="flex justify-between text-xs ks-mono">
                            <span>
                              {it.name} × {it.qty}
                              {it.unit}
                            </span>
                            <span>{rupee(it.qty * it.price)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {bills.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[var(--text-secondary)] text-sm">
                  {t("🧾 No bills yet — generate one from the \"New Bill\" tab.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="mt-4 text-center">
          <button type="button" onClick={showOlder} disabled={loadingMore} className="ks-btn-outline inline-flex items-center gap-2">
            {loadingMore && <Loader2 size={14} className="animate-spin" />}
            {t("Show older bills")}
          </button>
        </div>
      )}
      {printing && (
        <div className="ks-print-only">
          <PrintBillContent bill={printing} storeName={activeShop?.name} gstin={activeShop?.gstin} groupUrl={activeShop?.whatsapp_group_url} />
        </div>
      )}
    </div>
  );
}
