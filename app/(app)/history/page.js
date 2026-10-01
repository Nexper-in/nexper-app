"use client";

import { useEffect, useState, Fragment } from "react";
import { Printer, MessageCircle, Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { billMessageText, whatsappLink } from "@/lib/messaging";
import PrintBillContent from "@/components/PrintBillContent";
import ModuleGuard from "@/components/ModuleGuard";

export default function HistoryPage() {
  return (
    <ModuleGuard module="history">
      <HistoryPageInner />
    </ModuleGuard>
  );
}

function HistoryPageInner() {
  const { supabase, activeShopId, activeShop } = useShop();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [printing, setPrinting] = useState(null);

  useEffect(() => {
    if (!activeShopId) return;
    setLoading(true);
    supabase
      .from("bills")
      .select("*")
      .eq("shop_id", activeShopId)
      .order("date", { ascending: false })
      .then(({ data }) => {
        setBills(data || []);
        setLoading(false);
      });
  }, [supabase, activeShopId]);

  function doPrint(bill) {
    setPrinting(bill);
    setTimeout(() => window.print(), 50);
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading history…
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="ks-card overflow-hidden overflow-x-auto">
        <table className="ks-stack w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium">Bill No.</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Items</th>
              <th className="px-5 py-3 font-medium">Total</th>
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
                        UDHAAR
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
                        <Printer size={13} /> Print
                      </button>
                      {b.customer_phone && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(whatsappLink(b.customer_phone, billMessageText(b, activeShop?.name, activeShop?.gstin)), "_blank");
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1 text-white"
                          style={{ background: "#25D366" }}
                        >
                          <MessageCircle size={13} /> Send
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
                  🧾 No bills yet — generate one from the &quot;New Bill&quot; tab.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {printing && (
        <div className="ks-print-only">
          <PrintBillContent bill={printing} storeName={activeShop?.name} gstin={activeShop?.gstin} />
        </div>
      )}
    </div>
  );
}
