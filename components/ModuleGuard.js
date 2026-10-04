"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { hasFeature } from "@/lib/platformConfig";
import { isModuleEnabled } from "@/lib/modules";
import UpgradePrompt from "@/components/UpgradePrompt";

import { useT } from "@/lib/i18n";
// Wraps a route so it's inaccessible — not just hidden from the nav —
// to a shop member without that module's permission, or a shop that has
// disabled the module entirely. Real enforcement (writes are RLS-gated
// at the database) lives in the RLS policies; this closes the "just
// type the URL" gap for reads/UI.
//
// proOnly modules (Purchase Orders, Suppliers) still redirect a member
// without the base permission, but a Pro-gated module shows an upgrade
// card instead of bouncing to the dashboard — the point is to be seen,
// not hidden, so it can actually convert.
export default function ModuleGuard({ module, proOnly = false, proLabel, feature, children }) {
  const t = useT();
  const { activeShop, currentMember, hasPermission } = useShop();
  const router = useRouter();

  const enabled = isModuleEnabled(activeShop, module);
  const allowed = currentMember && enabled && hasPermission(module);

  useEffect(() => {
    if (currentMember && !allowed) router.replace("/dashboard");
  }, [currentMember, allowed, router]);

  if (!currentMember || !allowed) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  // A feature the admin has switched off (for everyone, or for this shop).
  if (feature && !hasFeature(activeShop, feature)) {
    return <div className="pt-6 text-sm" style={{ color: "var(--text-secondary)" }}>{t("This isn't available right now.")}</div>;
  }

  if (proOnly && !hasFeature(activeShop, module === "suppliers" ? "purchase_orders" : module)) {
    return <UpgradePrompt feature={proLabel || "This"} description={t("Upgrade to unlock it for your shop.")} />;
  }

  return children;
}
