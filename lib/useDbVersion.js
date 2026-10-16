"use client";
import { useEffect, useState } from "react";
import { useShop } from "@/components/ShopContext";
import { getDbVersion, versionAtLeast } from "@/lib/dbVersion";

// One lookup per page load, shared by every screen that asks.
let cached;

// { version, loading, atLeast("037") }. version is null before update 036.
export function useDbVersion() {
  const { supabase } = useShop();
  const [version, setVersion] = useState(cached === undefined ? undefined : cached);
  useEffect(() => {
    if (cached !== undefined || !supabase) return;
    let live = true;
    getDbVersion(supabase).then((v) => {
      cached = v;
      if (live) setVersion(v);
    });
    return () => {
      live = false;
    };
  }, [supabase]);
  return { version: version ?? null, loading: version === undefined, atLeast: (need) => versionAtLeast(version ?? null, need) };
}
