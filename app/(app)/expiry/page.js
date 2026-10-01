"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CalendarClock, Tag, Trash2, CheckCircle2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import ModuleGuard from "@/components/ModuleGuard";
import { fetchShopItems } from "@/lib/products";
import { useT } from "@/lib/i18n";

const HORIZON_DAYS = 30;
const SELL_FIRST_DAYS = 14;

export default function ExpiryPage() {
  return (
    <ModuleGuard module="inventory">
      <ExpiryScreen />
    </ModuleGuard>
  );
}

function daysLeft(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.round((d - today) / 86400000);
}

function ExpiryScreen() {
  const t = useT();
  const router = useRouter();
  const { supabase, activeShopId, isOwner, showToast } = useShop();
  const [items, setItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + HORIZON_DAYS);
    const [itemsData, { data }] = await Promise.all([
      fetchShopItems(supabase, activeShopId, { orderByCode: false }),
      supabase
        .from("stock_batches")
        .select("*")
        .eq("shop_id", activeShopId)
        .gt("qty_remaining", 0)
        .not("expiry_date", "is", null)
        .lte("expiry_date", horizon.toISOString().slice(0, 10))
        .order("expiry_date", { ascending: true }),
    ]);
    setItems(itemsData);
    setBatches(data || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      batches.map((b) => {
        const item = items.find((i) => i.id === b.shop_product_id);
        return { ...b, name: item?.name || t("Unknown item"), unit: item?.unit || "", days: daysLeft(b.expiry_date) };
      }),
    [batches, items, t]
  );
  const expired = rows.filter((r) => r.days < 0);
  const sellFirst = rows.filter((r) => r.days >= 0 && r.days <= SELL_FIRST_DAYS);
  const later = rows.filter((r) => r.days > SELL_FIRST_DAYS);

  async function writeOff(row) {
    setBusy(row.id);
    const { error } = await supabase.rpc("write_off_batch", { p_shop_id: activeShopId, p_batch_id: row.id, p_reason: "Expired" });
    setBusy(null);
    if (error) {
      showToast(/does not exist|schema cache/i.test(error.message) ? t("This needs the latest database update. Ask your admin.") : error.message, "error");
      return;
    }
    showToast(t("Removed {name} from stock", { name: row.name }));
    load();
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading…")}
      </div>
    );
  }

  function Section({ title, hint, list, tone, canRemove }) {
    if (list.length === 0) return null;
    return (
      <section className="mb-6">
        <h2 className="ks-display font-bold text-base">{title}</h2>
        <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>{hint}</p>
        <div className="ks-card overflow-hidden">
          {list.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0">
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }}
              >
                <CalendarClock size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{r.name}</p>
                <p className="text-xs" style={{ color: `var(--${tone})` }}>
                  {r.qty_remaining} {r.unit} ·{" "}
                  {r.days < 0 ? t("expired {n}d ago", { n: Math.abs(r.days) }) : r.days === 0 ? t("expires today") : t("expires in {n}d", { n: r.days })}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isOwner && !canRemove && (
                  <button
                    onClick={() => router.push(`/clearance?items=${r.shop_product_id}`)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1"
                    style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}
                  >
                    <Tag size={12} /> {t("Offer")}
                  </button>
                )}
                {canRemove && (
                  <button
                    onClick={() => writeOff(r)}
                    disabled={busy === r.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 disabled:opacity-50"
                    style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                  >
                    {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} {t("Remove")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="pt-6 max-w-3xl">
      <div className="mb-4">
        <h1 className="ks-display font-bold text-xl hidden lg:block">{t("Expiry")}</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {t("Stock that expires in the next {n} days. Sell the oldest first.", { n: HORIZON_DAYS })}
        </p>
      </div>

      {rows.length === 0 && (
        <div className="ks-card flex items-center gap-3 px-4 py-6">
          <CheckCircle2 size={22} style={{ color: "var(--success)" }} />
          <div>
            <p className="text-sm font-semibold">{t("Nothing is about to expire")}</p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {t("Add an expiry date when you add stock, and it will show up here.")}
            </p>
          </div>
        </div>
      )}

      <Section title={t("Expired")} hint={t("Take these off the shelf and remove them from stock.")} list={expired} tone="danger" canRemove />
      <Section title={t("Sell first")} hint={t("Expiring in {n} days. Put these in front, or make an offer.", { n: SELL_FIRST_DAYS })} list={sellFirst} tone="warn" />
      <Section title={t("Coming up")} hint={t("Expiring later this month.")} list={later} tone="udhaar" />
    </div>
  );
}
