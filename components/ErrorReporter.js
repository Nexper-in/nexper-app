"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useShop } from "@/components/ShopContext";

// Sends unexpected browser errors to /api/log-error (our own log, 30 days). At most 5 per page
// load, the same error only once. The server removes long numbers and email addresses.
export default function ErrorReporter() {
  const pathname = usePathname();
  const { supabase, activeShopId } = useShop();

  useEffect(() => {
    let sent = 0;
    const seen = new Set();
    async function report(message, stack) {
      const key = String(message).slice(0, 120);
      if (!message || sent >= 5 || seen.has(key)) return;
      seen.add(key);
      sent += 1;
      try {
        const { data } = await supabase.auth.getSession();
        await fetch("/api/log-error", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", ...(data?.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
          body: JSON.stringify({ message: String(message), stack: stack ? String(stack) : "", route: pathname, shopId: activeShopId }),
        });
      } catch {
        /* a failing reporter must stay silent */
      }
    }
    const onError = (e) => report(e.message || "Script error", e.error?.stack);
    const onRejection = (e) => report(e.reason?.message || String(e.reason || "Unhandled rejection"), e.reason?.stack);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [supabase, pathname, activeShopId]);

  return null;
}
