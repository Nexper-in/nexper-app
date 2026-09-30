"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function HeaderActions() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      createClient()
        .auth.getSession()
        .then(({ data: { session } }) => {
          if (active) setSignedIn(!!session);
        })
        .catch(() => {});
    } catch {}
    return () => {
      active = false;
    };
  }, []);

  if (signedIn) {
    return (
      <Link href="/dashboard" className="ks-btn-primary whitespace-nowrap">
        Open app
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Link href="/login" className="px-3 py-2 text-sm font-semibold rounded-lg hover:bg-black/5">
        Sign in
      </Link>
      <Link href="/login?mode=signup" className="ks-btn-primary whitespace-nowrap">
        Start free
      </Link>
    </div>
  );
}
