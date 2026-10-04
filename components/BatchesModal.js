"use client";

import { useEffect, useState } from "react";
import { Loader2, Layers } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { rupee } from "@/lib/format";

import { useT } from "@/lib/i18n";
const daysUntil = (dateStr) => Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));

function expiryTag(expiryDate, t) {
  if (!expiryDate) return null;
  const days = daysUntil(expiryDate);
  const label = new Date(expiryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (days < 0) return { text: t("Expired {date}", { date: label }), bg: "var(--danger-soft)", color: "var(--danger)" };
  if (days <= 14) return { text: t("Expires in {n}d ({date})", { n: days, date: label }), bg: "var(--warn-soft)", color: "var(--warn)" };
  return { text: t("Expires {date}", { date: label }), bg: "var(--bg-surface-alt)", color: "var(--text-secondary)" };
}

// FIFO order — oldest batch first, same order sell_items()/adjust_stock()
// consume from. Batches with qty_remaining = 0 are fully sold/used up
// but kept for the cost history, shown last and greyed out.
export default function BatchesModal({ item, supabase, activeShopId, onClose }) {
  const t = useT();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from("stock_batches")
      .select("*")
      .eq("shop_id", activeShopId)
      .eq("shop_product_id", item.id)
      .order("received_date", { ascending: true })
      .then(({ data }) => {
        if (active) {
          setBatches(data || []);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [supabase, activeShopId, item.id]);

  const sorted = [...batches].sort((a, b) => {
    if ((a.qty_remaining > 0) !== (b.qty_remaining > 0)) return a.qty_remaining > 0 ? -1 : 1;
    return new Date(a.received_date) - new Date(b.received_date);
  });

  return (
    <Modal title={t("Batches — {name}", { name: item.name })} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
          <Layers size={13} /> {t("Oldest batch sells first (FIFO).")}
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
            <Loader2 size={16} className="animate-spin" /> {t("Loading batches…")}
          </div>
        )}
        {!loading && sorted.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)] text-center py-8">
            {t("No batches yet — this item predates batch tracking, or has never been restocked with a logged purchase.")}
          </p>
        )}
        {!loading && sorted.length > 0 && (
          <div className="max-h-80 overflow-y-auto ks-scroll space-y-2">
            {sorted.map((b, idx) => {
              const used = b.qty_remaining <= 0;
              const tag = expiryTag(b.expiry_date, t);
              return (
                <div key={b.id} className={`rounded-xl p-3 border ${used ? "border-[var(--border)] opacity-50" : "border-[var(--border)]"}`}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold flex items-center gap-1.5">
                      {!used && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}>
                          {idx === 0 ? "NEXT TO SELL" : `#${idx + 1}`}
                        </span>
                      )}
                      {new Date(b.received_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                    <span className="ks-mono font-bold">
                      {b.qty_remaining} / {b.qty_received}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--text-secondary)]">
                    <span>{b.reason}</span>
                    {b.supplier && <span>· {b.supplier}</span>}
                    {b.cost_price != null && <span>· {t("cost {amt}", { amt: rupee(b.cost_price) })}</span>}
                  </div>
                  {tag && (
                    <span
                      className="inline-block mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: tag.bg, color: tag.color }}
                    >
                      {tag.text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
