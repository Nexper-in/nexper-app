// Two-step sign-in (authenticator app) for platform admins. The sign-in token carries an
// "aal" claim: aal1 = password only, aal2 = password plus the authenticator code. The token
// itself is verified by Supabase before this is looked at (lib/supabaseAdmin.js).

export function jwtAal(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

// ADMIN_MFA_REQUIRED=false switches the requirement off (allowed only on staging).
export function adminMfaRequired(env = process.env) {
  return String(env.ADMIN_MFA_REQUIRED ?? "true").toLowerCase() !== "false";
}

export const MFA_MESSAGE = "Two-step sign-in is required for admin. Sign in again and enter the code from your authenticator app.";

// null when fine; otherwise the refusal to send.
export function adminMfaProblem({ aal, required = adminMfaRequired() }) {
  if (required && aal !== "aal2") return { error: MFA_MESSAGE, status: 403 };
  return null;
}
