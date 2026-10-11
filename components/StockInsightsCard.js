"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingDown, ChevronRight } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { fetchShopItems } from "@/lib/products";
import { marginAlerts, deadStock } from "@/lib/stockHealth";
import { rupee } from "@/lib/format";
import { useT } from "@/lib/i18n";

// Home card: only appears when something needs a look, so a healthy shop
// sees nothing extra. Opens the full Stock insights page.
export default function StockInsightsCard() {
  const t = useT();
  const { supabase, activeShopId, hasPermission, isOwner } = useShop();
  const [s, setS] = useState(null);
  const allowed = isOwner || hasPermission("inventory");

  useEffect(() => {
    if (!activeShopId || !allowed) return;
    let live = true;
    const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
    Promise.all([
      fetchShopItems(supabase, activeShopId, { orderByCode: false }),
      supabase.from("stock_batches").select("shop_product_id, cost_price, received_date, reason").eq("shop_id", activeShopId).order("received_date", { ascending: false }).limit(5000),
      supabase.from("bills").select("items, date").eq("shop_id", activeShopId).gte("date", since),
    ]).then(([items, b, bills]) => {
      if (!live) return;
      const alerts = marginAlerts(items, b.data || []).length;
      const dead = deadStock(items, bills.data || [], { days: 30 });
      setS({ alerts, dead: dead.length, value: dead.reduce((a, d) => a + d.value, 0) });
    }).catch(() => {});
    return () => { live = false; };
  }, [supabase, activeShopId, allowed]);

  if (!s || (s.alerts === 0 && s.dead === 0)) return null;
  const parts = [];
  if (s.alerts > 0) parts.push(s.alerts === 1 ? t("1 item has a margin problem") : t("{n} items have a margin problem", { n: s.alerts }));
  if (s.dead > 0) parts.push(t("{amount} stuck in slow stock", { amount: rupee(s.value) }));
  return (
    <Link href="/insights" className="ks-card p-4 mb-3 flex items-center gap-3">
      <TrendingDown size={18} style={{ color: "var(--warn)" }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("Stock insights")}</p>
        <p className="text-xs text-[var(--text-secondary)]">{parts.join(" · ")}</p>
      </div>
      <ChevronRight size={16} style={{ color: "var(--text-secondary)" }} />
    </Link>
  );
}
