"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  Clock,
  Wallet,
  Calculator,
  Wallet2,
  BookOpen,
  Truck,
  Users,
  Settings,
  LogOut,
  Tag,
  MoreHorizontal,
  ChevronRight,
  ClipboardList,
  SlidersHorizontal,
  FileBarChart2,
  Sparkles,
} from "lucide-react";
import { useShop } from "@/components/ShopContext";
import ShopTypeIcon from "@/components/ShopTypeIcon";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import { shopTypeInfo } from "@/lib/shopTypes";
import { greeting, displayName, initials } from "@/lib/format";
import { isPro } from "@/lib/pricing";

const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", key: "inventory", label: "Inventory", icon: Package },
  { href: "/billing", key: "billing", label: "New Bill", icon: Receipt },
  { href: "/history", key: "history", label: "History", icon: Clock },
  { href: "/credit", key: "credit", label: "Udhaar", icon: Wallet },
  { href: "/dayclose", key: "dayclose", label: "Day Close", icon: Calculator },
  { href: "/expenses", key: "expenses", label: "Expenses", icon: Wallet2 },
  { href: "/cashbook", key: "cashbook", label: "Cashbook", icon: BookOpen },
  { href: "/suppliers", key: "suppliers", label: "Suppliers", icon: Truck, pro: true },
  { href: "/purchase-orders", key: "purchase_orders", label: "Purchase orders", icon: ClipboardList, pro: true },
  { href: "/reports", key: "reports", label: "Reports", icon: FileBarChart2 },
  // Gated on the same "inventory" permission as the main Inventory page —
  // batches (FIFO/expiry) and barcode printing are inventory-adjacent,
  // not a separate toggleable module.
  { href: "/inventory/config", key: "inventory", label: "Config", icon: SlidersHorizontal },
];

// These four stay one tap away; everything else — including the
// owner-only Staff/Clearance offers pages below — folds into "More" so
// the nav doesn't force scrolling on a phone-sized drawer. Matched by
// href, not permission key — Config shares the "inventory" key with
// the main Inventory page but must still land in "More".
const TOP_LEVEL_HREFS = ["/dashboard", "/billing", "/inventory", "/history"];

const todayStr = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function Sidebar({ onOpenSettings, onNavigate }) {
  const { supabase, activeShop, activeShopId, user, isOwner, hasPermission, pendingCount } = useShop();
  const pathname = usePathname();
  const router = useRouter();
  const [lowStockCount, setLowStockCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!activeShopId) return;
    let active = true;
    supabase
      .from("shop_products")
      .select("stock, low_at")
      .eq("shop_id", activeShopId)
      .then(({ data }) => {
        if (!active || !data) return;
        setLowStockCount(data.filter((i) => i.stock <= i.low_at).length);
      });
    return () => {
      active = false;
    };
  }, [supabase, activeShopId]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!activeShop) return null;

  const enabledModules = activeShop.enabled_modules || NAV_ITEMS.map((i) => i.key);
  const visibleNav = NAV_ITEMS.filter((item) => enabledModules.includes(item.key) && hasPermission(item.key));
  const topNav = visibleNav.filter((item) => TOP_LEVEL_HREFS.includes(item.href));
  const moreNav = [
    ...visibleNav.filter((item) => !TOP_LEVEL_HREFS.includes(item.href)),
    ...(isOwner && enabledModules.includes("staff") ? [{ href: "/staff", label: "Staff", icon: Users }] : []),
    ...(isOwner && enabledModules.includes("clearance") ? [{ href: "/clearance", label: "Clearance offers", icon: Tag }] : []),
  ];
  const moreActive = moreNav.some((item) => item.href === pathname);
  const showMore = moreOpen || moreActive;

  function renderNavItem(item) {
    const Icon = item.icon;
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => onNavigate?.()}
        className={`ks-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${active ? "active" : ""}`}
      >
        <Icon size={17} />
        {item.label}
        {item.pro && !isPro(activeShop) && (
          <span
            className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
          >
            PRO
          </span>
        )}
        {item.href === "/inventory" && lowStockCount > 0 && (
          <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E5484D] text-white text-[10px] font-bold">
            {lowStockCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="h-full flex flex-col ks-sidebar">
      <div className="p-4 space-y-3">
        <div className="ks-sidebar-chip rounded-2xl p-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="ks-sidebar-chip w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ks-sidebar-text-strong">
              <ShopTypeIcon type={activeShop.type} size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate ks-sidebar-text-strong">{activeShop.name}</p>
              <p className="text-[10px] font-medium ks-sidebar-text">{shopTypeInfo(activeShop.type).label}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-1">
          <span className="ks-sidebar-chip w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ks-sidebar-text-strong shrink-0">
            {initials(user)}
          </span>
          <p className="text-[11px] ks-sidebar-muted">
            {greeting()}
            {displayName(user) ? `, ${displayName(user)}` : ""} 👋
          </p>
        </div>
        <div className="ks-sidebar-gold-rule" />
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto ks-scroll">
        {topNav.map(renderNavItem)}
        {moreNav.length > 0 && (
          <>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`ks-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${
                moreActive && !moreOpen ? "active" : ""
              }`}
            >
              <MoreHorizontal size={17} />
              More
              <ChevronRight size={14} className={`ml-auto transition-transform ${showMore ? "rotate-90" : ""}`} />
            </button>
            {showMore && <div className="space-y-1 pl-2">{moreNav.map(renderNavItem)}</div>}
          </>
        )}
      </nav>

      <div className="p-3 border-t ks-sidebar-border">
        {pendingCount > 0 && (
          <div className="px-3.5 pb-2">
            <SyncStatusBadge pendingCount={pendingCount} />
          </div>
        )}
        <div className="ks-mono text-[10px] ks-sidebar-muted px-3.5 pb-2">{todayStr()}</div>
        {isOwner && !isPro(activeShop) && (
          <Link
            href="/upgrade"
            onClick={() => onNavigate?.()}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold mb-1"
            style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
          >
            <Sparkles size={17} /> Upgrade to Pro
          </Link>
        )}
        {isOwner && (
          <button
            onClick={onOpenSettings}
            className="ks-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold"
          >
            <Settings size={17} /> Store settings
          </button>
        )}
        <button
          onClick={handleSignOut}
          className="ks-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold"
        >
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </div>
  );
}
