import { createClient } from "@supabase/supabase-js";
import { jwtAal, adminMfaProblem } from "@/lib/adminMfa";

// SERVER-ONLY. Uses the service role key, which bypasses Row Level
// Security entirely. Never import this from a "use client" component —
// it must only ever run inside app/api/**/route.js handlers.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Verifies the bearer token from an incoming request and returns the
// caller's user (or null). Uses the anon key + the caller's own token,
// so this respects RLS — it's just identity verification, not a
// privilege escalation.
export async function getRequestUser(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  return user;
}

// Verifies the caller is both signed in and a platform admin. This is
// the real enforcement layer for app/api/admin/* routes — the client
// side page guard (checking is_platform_admin() from the browser) is
// only a UX convenience, not security. Checked directly against
// platform_admins with the service-role client rather than relying on
// the caller's own RLS view of that table (which has no policies at
// all — see migrations/006_platform_admin.sql).
export async function requireAdmin(request) {
  const caller = await getRequestUser(request);
  if (!caller) return { error: "Not signed in", status: 401 };

  const admin = createAdminClient();
  const { data: adminRow } = await admin.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!adminRow) return { error: "Not authorized", status: 403 };

  // Platform admins must also have passed the authenticator-app step (aal2).
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const mfa = adminMfaProblem({ aal: jwtAal(token) });
  if (mfa) return mfa;

  return { caller, admin };
}

// Best-effort audit log write — never throws, so a log failure
// never blocks the action that triggered it.
export async function logAdminAction(admin, callerId, callerEmail, action, targetType, targetId, meta = {}) {
  await admin
    .from("admin_audit_log")
    .insert({ admin_id: callerId, action, target_type: targetType, target_id: String(targetId), meta: { ...meta, adminEmail: callerEmail } })
    .catch(() => {});
}
