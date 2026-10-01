"use client";

import { Loader2 } from "lucide-react";
import ModuleGuard from "@/components/ModuleGuard";
import { useIsMobile } from "@/lib/useIsMobile";
import { useT } from "@/lib/i18n";
import useCredit from "./useCredit";
import CreditMobile from "./CreditMobile";
import CreditDesktop from "./CreditDesktop";
import CreditModals from "./CreditModals";

// Udhaar. The logic lives in useCredit; the phone and laptop screens are
// separate files so each can be designed for its own screen.
export default function CreditPage() {
  return (
    <ModuleGuard module="credit">
      <CreditScreen />
    </ModuleGuard>
  );
}

function CreditScreen() {
  const t = useT();
  const isMobile = useIsMobile();
  const vm = useCredit();

  if (vm.loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading udhaar…")}
      </div>
    );
  }

  return (
    <>
      {isMobile ? <CreditMobile vm={vm} /> : <CreditDesktop vm={vm} />}
      <CreditModals vm={vm} />
    </>
  );
}
