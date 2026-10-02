"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { isModuleEnabled } from "@/lib/modules";
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
  const router = useRouter();
  const { activeShop, currentMember, hasPermission } = useShop();
  const vm = useHome();
  // A helper who only does the supply round lands straight on it.
  const supplyOnly = Boolean(currentMember) && !hasPermission("dashboard") && hasPermission("supplies") && isModuleEnabled(activeShop, "supplies");
  useEffect(() => {
    if (supplyOnly) router.replace("/supplies");
  }, [supplyOnly, router]);
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
