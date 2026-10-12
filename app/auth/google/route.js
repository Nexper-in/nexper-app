import { NextResponse } from "next/server";

// Google's sign-in button, in redirect mode (used on phones, where its popup
// fails), posts the signed-in Google credential here. We check Google's CSRF
// cookie, then hand the credential to the browser in the URL fragment (never
// sent to any server or logged); /auth/google/done gives it to Supabase.
export async function POST(request) {
  const origin = new URL(request.url).origin;
  const fail = () => NextResponse.redirect(`${origin}/login?error=google`, 303);
  try {
    const form = await request.formData();
    const credential = String(form.get("credential") || "");
    const csrfBody = String(form.get("g_csrf_token") || "");
    const csrfCookie = request.cookies.get("g_csrf_token")?.value || "";
    if (!credential || !csrfBody || csrfBody !== csrfCookie) return fail();
    const res = NextResponse.redirect(`${origin}/auth/google/done#credential=${encodeURIComponent(credential)}`, 303);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch {
    return fail();
  }
}
