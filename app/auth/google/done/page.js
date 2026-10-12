"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

// Finishes Google sign-in on phones: reads the Google credential from the URL
// fragment and the matching nonce saved before leaving the login page, and
// signs in to Supabase with them.
export default function GoogleDonePage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const credential = new URLSearchParams(window.location.hash.slice(1)).get("credential");
    let nonce = null;
    try { nonce = localStorage.getItem("nexper.gnonce"); localStorage.removeItem("nexper.gnonce"); } catch {}
    window.history.replaceState(null, "", window.location.pathname); // drop the token from the address bar
    if (!credential || !nonce) {
      router.replace("/login?error=google");
      return;
    }
    supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce }).then(({ error }) => {
      if (error) {
        setMessage(error.message);
        router.replace("/login?error=google");
      } else router.replace("/dashboard");
    });
  }, [supabase, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="animate-spin text-brand" size={28} />
      <p className="text-sm text-muted">{message}</p>
    </main>
  );
}
