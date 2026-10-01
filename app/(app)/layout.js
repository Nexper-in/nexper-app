"use client";

import { useEffect, useState } from "react";
import { Menu, Loader2, WifiOff, RefreshCw } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { ShopProvider, useShop } from "@/components/ShopContext";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { AddShopOnboarding } from "@/components/ShopOnboarding";
import StoreSettingsModal from "@/components/StoreSettingsModal";
import Toast from "@/components/ui/Toast";
import AccountMenu from "@/components/AccountMenu";

function OfflineBanner() {
  const { pendingCount } = useShop();
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      setSyncing(true);
      const t = setTimeout(() => setSyncing(false), 2500);
      return () => clearTimeout(t);
    }
  }, [isOnline, pendingCount]);

  if (isOnline && pendingCount === 0 && !syncing) return null;

  if (syncing) {
    return (
      <div
        className="ks-no-print fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 text-xs font-semibold"
        style={{ background: "rgba(34,197,94,0.9)", color: "#fff" }}
      >
        <RefreshCw size={13} className="animate-spin" />
        Syncing {pendingCount} offline bill{pendingCount === 1 ? "" : "s"}…
      </div>
    );
  }

  return (
    <div
      className="ks-no-print fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 text-xs font-semibold"
      style={{ background: "rgba(220,38,38,0.9)", color: "#fff" }}
    >
      <WifiOff size={13} />
      Offline
      {pendingCount > 0 && <span>· {pendingCount} bill{pendingCount === 1 ? "" : "s"} will sync when reconnected</span>}
    </div>
  );
}

function AppShell({ children }) {
  const { shops, activeShop, addShop, loading, toast } = useShop();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showStoreSettings, setShowStoreSettings] = useState(false);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-brand" size={28} />
      </main>
    );
  }

  if (shops.length === 0) {
    return <AddShopOnboarding onAdd={addShop} />;
  }

  return (
    <div className="min-h-screen flex">
      <OfflineBanner />
      <div className="ks-no-print ks-mobile-bar ks-topbar fixed top-0 left-0 right-0 z-30 items-center justify-between gap-2 px-3 py-2">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="w-9 h-9 flex items-center justify-center rounded-full shrink-0"
          style={{ color: "var(--text-secondary)" }}
        >
          <Menu size={20} />
        </button>
        <span className="ks-display text-sm font-bold truncate px-1 flex-1 text-center">{activeShop?.name}</span>
        <AccountMenu onOpenSettings={() => setShowStoreSettings(true)} />
      </div>

      {sidebarOpen && (
        <div
          className="ks-no-print ks-mobile-overlay fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`ks-no-print ks-sidebar-wrap${sidebarOpen ? " open" : ""}`}>
        <Sidebar onOpenSettings={() => setShowStoreSettings(true)} onNavigate={() => setSidebarOpen(false)} />
      </div>

      <BottomNav onMore={() => setSidebarOpen(true)} />

      {showStoreSettings && <StoreSettingsModal onClose={() => setShowStoreSettings(false)} />}

      <div className="ks-main flex-1 min-w-0">
        <div className="ks-no-print ks-desk-bar ks-page-pad max-w-5xl items-center justify-end">
          <AccountMenu onOpenSettings={() => setShowStoreSettings(true)} />
        </div>
        <main className="flex-1 min-w-0 ks-page-pad ks-page-bottom-safe max-w-5xl">{children}</main>
      </div>

      {toast && <Toast msg={toast.msg} tone={toast.tone} />}
    </div>
  );
}

export default function AppLayout({ children }) {
  return (
    <AuthGuard>
      <ShopProvider>
        <AppShell>{children}</AppShell>
      </ShopProvider>
    </AuthGuard>
  );
}
