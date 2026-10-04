"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

// Google sends the owner back here after they pick an account. The
// Supabase client swaps the ?code= for a session; then we go to the
// dashboard (a brand-new owner sees "Set up your shop" there first).
export default function AuthCallbackPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const failed = params.get("error_description") || params.get("error");
    if (failed) {
      router.replace(`/login?error=${encodeURIComponent(failed)}`);
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      router.replace("/dashboard");
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) finish();
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return finish();
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return finish();
        // The client may already have used the code; give it a moment.
        const again = await supabase.auth.getSession();
        if (again.data.session) return finish();
        setMessage("That sign-in link has expired. Taking you back…");
        setTimeout(() => router.replace(`/login?error=${encodeURIComponent("Sign-in didn't finish. Please try again.")}`), 1500);
      } else {
        router.replace("/login");
      }
    })();

    return () => listener.subscription.unsubscribe();
  }, [supabase, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="animate-spin text-brand" size={28} />
      <p className="text-sm text-muted">{message}</p>
    </main>
  );
}
