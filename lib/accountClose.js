// SERVER-ONLY. Closing an owner's whole account, and finishing it 90 days later.
//   closeAccount: every open shop of the companies the person owns is closed (read-only, 90 days to
//                 download or reopen), and the sign-in is scheduled for deletion.
//   finishClosures: the daily job; deletes the sign-in (and the helpers' staff-code sign-ins) once the
//                 person owns no shop any more.
// `admin` is the service-role client. See docs/MULTITENANT_DESIGN.md section 3.9.

const DAY = 86_400_000;
const GRACE_DAYS = 91; // one day after the last shop's 90 days, so the shops are purged first

export async function closeAccount({ admin, user, confirmEmail }) {
  if (!user?.email || String(confirmEmail || "").trim().toLowerCase() !== user.email.toLowerCase()) {
    return { status: 400, body: { error: "Type your email address to confirm." } };
  }
  const { data: orgs, error: orgError } = await admin.from("organisations").select("id").eq("owner_id", user.id);
  if (orgError) return { status: /does not exist|schema cache/i.test(orgError.message) ? 400 : 500, body: { error: "This needs the latest database update." } };
  if (!orgs?.length) return { status: 400, body: { error: "You do not own a shop. Ask the owner of the shop to remove you." } };

  const orgIds = orgs.map((o) => o.id);
  const { data: shops } = await admin.from("shops").select("id, status, org_id").in("org_id", orgIds);
  const open = (shops || []).filter((s) => s.status !== "closed");

  // The helpers' staff-code sign-ins of these shops go with the account.
  const staff = new Set();
  for (const s of shops || []) {
    const { data: members } = await admin.from("shop_members").select("user_id, role, staff_code, via_org").eq("shop_id", s.id);
    for (const m of members || []) if (m.role === "staff" && m.staff_code && !m.via_org) staff.add(m.user_id);
  }

  for (const s of open) {
    const { error } = await admin.rpc("admin_close_shop", { p_shop: s.id, p_reason: "Account closed by the owner" });
    if (error) return { status: 500, body: { error: "Something went wrong. Please try again." } };
  }
  const deleteAfter = new Date(Date.now() + GRACE_DAYS * DAY).toISOString();
  const { error: closureError } = await admin.from("account_closures").upsert({ user_id: user.id, email: user.email, delete_after: deleteAfter, staff_user_ids: [...staff] });
  if (closureError) return { status: 500, body: { error: "Something went wrong. Please try again." } };
  return { status: 200, body: { ok: true, shopsClosed: open.length, deleteAfter } };
}

export async function cancelClosure({ admin, user }) {
  const { error } = await admin.from("account_closures").delete().eq("user_id", user.id);
  if (error) return { status: 500, body: { error: "Something went wrong. Please try again." } };
  return { status: 200, body: { ok: true } };
}

export async function closureOf({ admin, user }) {
  const { data, error } = await admin.from("account_closures").select("requested_at, delete_after").eq("user_id", user.id).maybeSingle();
  if (error) return { closing: null };
  return { closing: data || null };
}

// The daily job. Returns { deleted, cancelled }.
export async function finishClosures(admin, now = new Date()) {
  const out = { deleted: 0, cancelled: 0 };
  const { data: due, error } = await admin.from("account_closures").select("user_id, email, staff_user_ids, delete_after").lt("delete_after", now.toISOString()).limit(50);
  if (error) return out; // before update 046
  for (const c of due || []) {
    const { data: left } = await admin.from("shops").select("id, status").eq("owner_id", c.user_id).limit(50);
    if ((left || []).some((s) => s.status !== "closed")) {
      // An open shop is there (it was reopened): the owner changed their mind. Nothing is deleted.
      await admin.from("account_closures").delete().eq("user_id", c.user_id);
      out.cancelled += 1;
      continue;
    }
    if (left?.length) continue; // closed shops still waiting to be removed: try again tomorrow
    for (const id of c.staff_user_ids || []) await admin.auth.admin.deleteUser(id).catch(() => {});
    const { error: delError } = await admin.auth.admin.deleteUser(c.user_id);
    if (delError && !/not found/i.test(delError.message)) continue; // try again tomorrow
    await admin.from("account_closures").delete().eq("user_id", c.user_id);
    await admin.from("admin_audit_log").insert({ admin_id: "00000000-0000-0000-0000-000000000000", action: "account_deleted", target_type: "owner", target_id: c.user_id, meta: { email: c.email } });
    out.deleted += 1;
  }
  return out;
}
