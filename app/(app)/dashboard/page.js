"use client";

import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/lib/useIsMobile";
import { useT } from "@/lib/i18n";
import { useHome } from "./useHome";
import HomeMobile from "./HomeMobile";
import HomeDesktop from "./HomeDesktop";
import { HomeModals } from "./HomeParts";

// Home has two separate screens: HomeMobile (phones, lean) and HomeDesktop
// (laptops, full dashboard). Data is shared in useHome.
export default function DashboardPage() {
  const t = useT();
  const vm = useHome();
  const isMobile = useIsMobile();
  if (vm.loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading…")}
      </div>
    );
  }
  return (
    <>
      {isMobile ? <HomeMobile vm={vm} /> : <HomeDesktop vm={vm} />}
      <HomeModals vm={vm} />
    </>
  );
}
