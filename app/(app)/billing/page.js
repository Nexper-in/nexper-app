"use client";

import { Loader2 } from "lucide-react";
import ModuleGuard from "@/components/ModuleGuard";
import { useIsMobile } from "@/lib/useIsMobile";
import { useT } from "@/lib/i18n";
import { useBilling } from "./useBilling";
import BillingMobile from "./BillingMobile";
import BillingDesktop from "./BillingDesktop";
import { BillingModals } from "./BillingParts";

// New bill has two separate screens: BillingMobile (phones) and
// BillingDesktop (laptops). The cart, totals and saving are shared in
// useBilling.
export default function BillingPage() {
  return (
    <ModuleGuard module="billing">
      <BillingScreen />
    </ModuleGuard>
  );
}

function BillingScreen() {
  const t = useT();
  const vm = useBilling();
  const isMobile = useIsMobile();
  if (vm.loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading billing…")}
      </div>
    );
  }
  return (
    <>
      {isMobile ? <BillingMobile vm={vm} /> : <BillingDesktop vm={vm} />}
      <BillingModals vm={vm} />
    </>
  );
}
