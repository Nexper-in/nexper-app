// A small stand-in for the Supabase REST API (PostgREST + auth) for server-route tests. It holds
// tables as arrays and understands what the routes use: eq/gte filters, limit, single/maybeSingle,
// HEAD counts, inserts. Install it with `install(db)`; it replaces globalThis.fetch until `restore()`.
export function installFakeSupabase(db, { user = { id: "u1", email: "u1@x" } } = {}) {
  const realFetch = globalThis.fetch;
  const log = [];
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = (init.method || "GET").toUpperCase();
    if (u.pathname === "/auth/v1/user") return user ? json({ id: user.id, email: user.email, aud: "authenticated" }) : json({ message: "no" }, 401);
    const m = u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (!m) return json({}, 404);
    const table = m[1];
    if (!(table in db)) return json({ code: "42P01", message: `relation "public.${table}" does not exist` }, 404);
    let rows = db[table];
    for (const [k, v] of u.searchParams) {
      const f = String(v).match(/^(eq|gte|is)\.(.*)$/);
      if (!f) continue;
      rows = rows.filter((r) => (f[1] === "eq" ? String(r[k]) === f[2] : f[1] === "gte" ? String(r[k]) >= f[2] : f[2] === "null" ? r[k] == null : true));
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
