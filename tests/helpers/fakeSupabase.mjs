// A small stand-in for the Supabase REST API (PostgREST + auth) for server-route tests. It holds
// tables as arrays and understands what the routes use: eq/gte filters, limit, single/maybeSingle,
// HEAD counts, inserts. Install it with `install(db)`; it replaces globalThis.fetch until `restore()`.
export function installFakeSupabase(db, { user = { id: "u1", email: "u1@x" }, rpc = {} } = {}) {
  const realFetch = globalThis.fetch;
  const log = [];
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = (init.method || "GET").toUpperCase();
    if (u.pathname === "/auth/v1/user") return user ? json({ id: user.id, email: user.email, aud: "authenticated" }) : json({ message: "no" }, 401);
    const au = u.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
    if (au) log.push(["auth-admin", (init.method || "GET").toUpperCase(), au[1]]);
    if (au) return json({ id: au[1], email: `staff-x@workers.nexper.internal`, aud: "authenticated" });
    const r = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (r) {
      const args = JSON.parse(init.body || "{}");
      log.push(["rpc", r[1], args]);
      if (!rpc[r[1]]) return json({ code: "PGRST202", message: `Could not find the function public.${r[1]}` }, 404);
      return json(rpc[r[1]](args));
    }
    const m = u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (!m) return json({}, 404);
    const table = m[1];
    if (!(table in db)) return json({ code: "42P01", message: `relation "public.${table}" does not exist` }, 404);
    let rows = db[table];
    for (const [k, v] of u.searchParams) {
      const f = String(v).match(/^(eq|gte|lt|is|in)\.(.*)$/);
      if (!f) continue;
      rows = rows.filter((r) => {
        if (f[1] === "eq") return String(r[k]) === f[2];
        if (f[1] === "gte") return String(r[k]) >= f[2];
        if (f[1] === "lt") return String(r[k]) < f[2];
        if (f[1] === "in") return f[2].replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(r[k]));
        return f[2] === "null" ? r[k] == null : true;
      });
    }
    if (method === "DELETE") {
      const gone = rows;
      db[table] = db[table].filter((r) => !gone.includes(r));
      log.push(["delete", table, gone]);
      return json(gone);
    }
    if (method === "POST") {
      const body = JSON.parse(init.body || "{}");
      const added = (Array.isArray(body) ? body : [body]).map((b) => ({ id: "n" + (db[table].length + 1), ...b }));
      db[table].push(...added);
      log.push(["insert", table, added]);
      return json(added, 201);
    }
    const accept = new Headers(init.headers || {}).get("accept") || "";
    const total = rows.length;
    const lim = Number(u.searchParams.get("limit"));
    if (lim) rows = rows.slice(0, lim);
    const range = { "content-range": `0-${Math.max(0, rows.length - 1)}/${total}` };
    if (method === "HEAD") return new Response(null, { status: 200, headers: range });
    if (accept.includes("vnd.pgrst.object")) return rows.length ? json(rows[0], 200, range) : json({ message: "none" }, 406);
    return json(rows, 200, range);
  };
  return { log, restore: () => (globalThis.fetch = realFetch) };
}
