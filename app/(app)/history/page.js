"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { Printer, MessageCircle, Loader2, Undo2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { billMessageText, whatsappLink } from "@/lib/messaging";
import PrintBillContent from "@/components/PrintBillContent";
import ModuleGuard from "@/components/ModuleGuard";
import ReturnModal from "@/components/ReturnModal";

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
  const { supabase, activeShopId, activeShop, hasPermission, showToast } = useShop();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [returns, setReturns] = useState([]);
  const [returning, setReturning] = useState(null);

  useEffect(() => {
    if (!activeShopId) return;
    setLoading(true);
    Promise.all([
      supabase.from("bills").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }),
      supabase.from("sale_returns").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }),
    ]).then(([{ data }, { data: rets }]) => {
      setBills(data || []);
      setReturns(rets || []);
      setLoading(false);
    });
  }, [supabase, activeShopId]);

  const returnsByBill = useMemo(() => {
    const m = new Map();
    for (const r of returns) m.set(r.bill_id, [...(m.get(r.bill_id) || []), r]);
    return m;
  }, [returns]);

  function returnDone(row) {
    setReturns((prev) => [row, ...prev]);
    setReturning(null);
    showToast(t("Return recorded. Refund {amount}", { amount: rupee(row.refund_amount) }));
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
                    {returnsByBill.has(b.id) && (
                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                        {t("RETURNED")}
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
                      {hasPermission("billing") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReturning(b);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1"
                          style={{ background: "var(--bg-surface-alt)", color: "var(--text-primary)" }}
                        >
                          <Undo2 size={13} /> {t("Return")}
                        </button>
                      )}
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
                        {(returnsByBill.get(b.id) || []).map((r) => (
                          <div key={r.id} className="flex justify-between text-xs ks-mono" style={{ color: "var(--warn)" }}>
                            <span>
                              ↩ {t("Returned")} {(r.items || []).map((it) => `${it.name} × ${it.qty}`).join(", ")} · {new Date(r.date).toLocaleDateString("en-IN")}
                            </span>
                            <span>−{rupee(r.refund_amount)}</span>
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
      {returning && (
        <ReturnModal bill={returning} returnsForBill={returnsByBill.get(returning.id) || []} supabase={supabase} shopId={activeShopId} onClose={() => setReturning(null)} onDone={returnDone} />
      )}
      {printing && (
        <div className="ks-print-only">
          <PrintBillContent bill={printing} storeName={activeShop?.name} gstin={activeShop?.gstin} groupUrl={activeShop?.whatsapp_group_url} />
        </div>
      )}
    </div>
  );
}
