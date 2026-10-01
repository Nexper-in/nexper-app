"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Tag, Calendar } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import ClearanceOfferModal from "@/components/ClearanceOfferModal";
import { fetchShopItems } from "@/lib/products";
import { rupee } from "@/lib/format";

import { T, useT } from "@/lib/i18n";
const todayStr = () => new Date().toISOString().slice(0, 10);

function offerStatus(offer) {
  const today = todayStr();
  if (today < offer.start_date) return "upcoming";
  if (today > offer.end_date) return "expired";
  return "active";
}

const STATUS_INFO = {
  active: { label: T("Active now"), bg: "var(--success-soft)", color: "var(--success)" },
  upcoming: { label: T("Upcoming"), bg: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" },
  expired: { label: T("Ended"), bg: "var(--bg-surface-alt)", color: "var(--text-secondary)" },
};

const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function ClearancePage() {
  const t = useT();
  const { supabase, activeShopId, currentMember, isOwner, showToast } = useShop();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [offers, setOffers] = useState([]);
  const [expiringSoonIds, setExpiringSoonIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [prefillIds, setPrefillIds] = useState([]);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    if (currentMember && !isOwner) router.replace("/dashboard");
  }, [currentMember, isOwner, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ids = new URLSearchParams(window.location.search).get("items");
    if (ids) {
      setPrefillIds(ids.split(","));
      setShowNew(true);
      router.replace("/clearance");
    }
  }, [router]);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 14);
    const [itemsData, { data: offersData }, { data: batchesData }] = await Promise.all([
      fetchShopItems(supabase, activeShopId),
      supabase
        .from("clearance_offers")
        .select("id, name, discount_pct, start_date, end_date, items:clearance_offer_items(shop_product_id)")
        .eq("shop_id", activeShopId)
        .order("start_date", { ascending: false }),
      supabase
        .from("stock_batches")
        .select("shop_product_id")
        .eq("shop_id", activeShopId)
        .gt("qty_remaining", 0)
        .not("expiry_date", "is", null)
        .lte("expiry_date", horizon.toISOString().slice(0, 10)),
    ]);
    setItems(itemsData);
    setOffers(offersData || []);
    setExpiringSoonIds([...new Set((batchesData || []).map((b) => b.shop_product_id))]);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const itemName = (id) => items.find((i) => i.id === id)?.name || "Deleted item";

  async function createOffer(fields, itemIds) {
    const { data: offer, error } = await supabase
      .from("clearance_offers")
      .insert({ ...fields, shop_id: activeShopId })
      .select()
      .single();
    if (error) throw error;
    const { error: itemsError } = await supabase
      .from("clearance_offer_items")
      .insert(itemIds.map((shop_product_id) => ({ offer_id: offer.id, shop_product_id })));
    if (itemsError) throw itemsError;
    setShowNew(false);
    setPrefillIds([]);
    showToast(t("{name} started — {pct}% off {n} items", { name: fields.name, pct: fields.discount_pct, n: itemIds.length }));
    load();
  }

  async function confirmRemove() {
    const { error } = await supabase.from("clearance_offers").delete().eq("id", removing.id);
    if (error) {
      showToast(error.message, "err");
      return;
    }
    setOffers((prev) => prev.filter((o) => o.id !== removing.id));
    setRemoving(null);
    showToast(t("Clearance offer removed"));
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading clearance offers…")}
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="ks-display font-bold text-lg flex items-center gap-2">
            <Tag size={18} style={{ color: "var(--accent-soft-text)" }} /> {t("Quick clearance offers")}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {t("A time-boxed discount on picked items. It applies automatically in Billing while the dates are open, and reverts on its own once the offer ends.")}
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="ks-btn-primary flex items-center gap-1.5">
          <Plus size={16} /> {t("New offer")}
        </button>
      </div>

      {offers.length === 0 ? (
        <div className="ks-card p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-3">{t("No clearance offers yet.")}</p>
          <button onClick={() => setShowNew(true)} className="ks-btn-primary inline-flex items-center gap-1.5">
            <Plus size={16} /> {t("Start your first offer")}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {offers.map((offer) => {
            const status = offerStatus(offer);
            const info = STATUS_INFO[status];
            return (
              <div key={offer.id} className="ks-card p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-sm">{offer.name}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: info.bg, color: info.color }}>
                      {t(info.label)}
                    </span>
                    <span className="text-xs font-bold" style={{ color: "var(--danger)" }}>
                      −{Number(offer.discount_pct)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1 mb-1.5">
                    <Calendar size={11} /> {fmtDate(offer.start_date)} – {fmtDate(offer.end_date)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(offer.items || []).map((it) => (
                      <span
                        key={it.shop_product_id}
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
                      >
                        {itemName(it.shop_product_id)}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setRemoving(offer)}
                  title={t("Remove offer")}
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <ClearanceOfferModal
          items={items}
          suggestedIds={expiringSoonIds}
          initialSelectedIds={prefillIds}
          onClose={() => {
            setShowNew(false);
            setPrefillIds([]);
          }}
          onConfirm={createOffer}
        />
      )}

      {removing && (
        <div className="ks-no-print fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] px-4">
          <div className="bg-[var(--bg-surface)] rounded-3xl w-full max-w-sm shadow-2xl p-5">
            <h3 className="ks-display font-bold mb-2">{t("Remove \"{name}\"?", { name: removing.name })}</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t("Items go back to their normal price immediately. This can't be undone.")}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setRemoving(null)} className="ks-btn-outline flex-1">
                {t("Cancel")}
              </button>
              <button
                onClick={confirmRemove}
                className="flex-1 rounded-full text-white text-sm font-semibold py-2.5"
                style={{ background: "var(--danger-solid)" }}
              >
                {t("Remove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
