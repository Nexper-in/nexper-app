"use client";

import { Loader2 } from "lucide-react";
import ModuleGuard from "@/components/ModuleGuard";
import { useIsMobile } from "@/lib/useIsMobile";
import { useT } from "@/lib/i18n";
import { useStock } from "./useStock";
import StockMobile from "./StockMobile";
import StockDesktop from "./StockDesktop";
import { StockModals } from "./StockParts";

// Stock has two separate screens: StockMobile (phones) and StockDesktop
// (laptops). Data and actions are shared in useStock.
export default function InventoryPage() {
  return (
    <ModuleGuard module="inventory">
      <StockScreen />
    </ModuleGuard>
  );
}

function StockScreen() {
  const t = useT();
  const vm = useStock();
  const isMobile = useIsMobile();
  if (vm.loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading stock…")}
      </div>
    );
  }
  return (
    <>
      {isMobile ? <StockMobile vm={vm} /> : <StockDesktop vm={vm} />}
      <StockModals vm={vm} />
    </>
  );
}
