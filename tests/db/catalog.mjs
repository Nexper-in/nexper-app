// Run: node tests/db/catalog.mjs (part of npm run test:db). The checklist for a new
// table or function, enforced on the real schema so nobody has to remember it:
//   S2  every table has row-level security on
//   S3  every shop_id has a foreign key to shops(id) on delete cascade
//   S4  every table with shop_id has an index that starts with shop_id
//   S5  every security definer function sets search_path and refuses anon
//   S6  every table is classified in tests/db/tables.mjs (kind + lifecycle)
//   S7  tables marked appendOnly cannot be updated or deleted by any API role
//   S8  every update from 036 on records itself under its own file name and does
//       not drop a table or column unless it says "-- nexper:contract"
// The checks live in checkCatalog(); the second half of this file feeds it a
// deliberately broken database to prove that each rule really fails.
import fs from "node:fs";
import { buildDb, ROOT, counter } from "./setup.mjs";
import { TABLES, KINDS, LIFECYCLES, ANON_CALLABLE } from "./tables.mjs";

const rows = async (db, sql) => (await db.query(sql)).rows;

export async function checkCatalog(db, { tables = TABLES, migrationsDir = ROOT + "migrations" } = {}) {
  const problems = [];
  const add = (rule, msg) => problems.push(`${rule}: ${msg}`);

  const present = await rows(db, `select c.relname n, c.relrowsecurity rls from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' order by 1`);
  const names = new Set(present.map((t) => t.n));

  // S2 + S6
  for (const t of present) {
    if (!t.rls) add("S2", `${t.n} has row-level security OFF`);
    const c = tables[t.n];
    if (!c) {
      add("S6", `${t.n} is not classified: add it to tests/db/tables.mjs (kind and lifecycle)`);
      continue;
    }
    if (!KINDS.includes(c.kind)) add("S6", `${t.n} has an unknown kind "${c.kind}"`);
    if (!LIFECYCLES.includes(c.lifecycle)) add("S6", `${t.n} has an unknown lifecycle "${c.lifecycle}"`);
  }
  for (const n of Object.keys(tables)) if (!names.has(n)) add("S6", `tests/db/tables.mjs lists ${n} but there is no such table`);

  const fks = await rows(
    db,
    `select conrelid::regclass::text t, a.attname col, confrelid::regclass::text ref, confdeltype del
     from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey) where contype = 'f'`
  );
  const shopCols = new Set((await rows(db, `select table_name t from information_schema.columns where table_schema = 'public' and column_name = 'shop_id'`)).map((r) => r.t));
  const shopIdx = new Set(
    (
      await rows(
        db,
        `select c.relname t from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname = 'shop_id' and not a.attisdropped
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
           and exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisvalid and i.indkey[0] = a.attnum)`
      )
    ).map((r) => r.t)
  );

  for (const n of names) {
    const c = tables[n];
    if (!c) continue;
    const hasShop = shopCols.has(n);
    if (c.kind === "shop" && !hasShop) add("S3", `${n} is classified "shop" but has no shop_id column`);
    if (hasShop && !["shop", "platform"].includes(c.kind) && n !== "shops") add("S3", `${n} has a shop_id column but is classified "${c.kind}"`);
    if (hasShop && n !== "shops") {
      const fk = fks.find((f) => f.t === n && f.col === "shop_id" && f.ref === "shops");
      if (!(fk && fk.del === "c") && !c.exceptions?.shopFk) add("S3", `${n}.shop_id must reference shops(id) on delete cascade (or give a reason in exceptions.shopFk)`);
      if (!shopIdx.has(n) && !c.exceptions?.shopIndex) add("S4", `${n} needs an index that starts with shop_id (or give a reason in exceptions.shopIndex)`);
      if (c.lifecycle !== "with-shop" && !c.exceptions?.shopFk) add("S6", `${n} has shop_id so its lifecycle should be with-shop, not ${c.lifecycle}`);
    }
    if (c.kind === "shop-child") {
      const fk = fks.find((f) => f.t === n && f.col === c.fk && f.ref === c.parent);
      if (!(fk && fk.del === "c")) add("S3", `${n}.${c.fk} must reference ${c.parent} on delete cascade`);
      if (hasShop) add("S3", `${n} is a shop-child but also has shop_id: classify it "shop"`);
    }
  }

  // S5
  const fns = await rows(
    db,
    `select p.proname n, p.prorettype::regtype::text ret,
            exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') sp,
            has_function_privilege('anon', p.oid, 'execute') anon
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef order by 1`
  );
  for (const f of fns) {
    if (!f.sp) add("S5", `function ${f.n} runs with the owner's rights but does not set search_path`);
    if (f.anon && f.ret !== "trigger" && !ANON_CALLABLE[f.n]) add("S5", `function ${f.n} can be called by anon: revoke execute from public, anon (or allow-list it with a reason in tests/db/tables.mjs)`);
  }

  // S7
  for (const [n, c] of Object.entries(tables)) {
    if (!c.appendOnly || !names.has(n)) continue;
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const priv of ["update", "delete"]) {
        const [{ ok }] = await rows(db, `select has_table_privilege('${role}', 'public.${n}', '${priv}') ok`);
        if (ok) add("S7", `${n} is append-only but ${role} can ${priv} it`);
      }
    }
  }

  // S8
  for (const f of fs.readdirSync(migrationsDir).filter((x) => /^\d{3}b?_.*\.sql$/.test(x)).sort()) {
    const ver = f.split("_")[0];
    if (ver < "036") continue;
    const sql = fs.readFileSync(`${migrationsDir}/${f}`, "utf8");
    const rec = [...sql.matchAll(/record_migration\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)];
    if (!rec.some((m) => m[1] === ver && m[2] === f)) add("S8", `${f} must end with: select record_migration('${ver}', '${f}');`);
    const noComments = sql.replace(/--[^\n]*/g, "");
    if (/\bdrop\s+table\b|\bdrop\s+column\b|\bdrop\s+schema\b/i.test(noComments) && !/--\s*nexper:contract/.test(sql)) {
      add("S8", `${f} drops a table or column: split it into expand and contract and mark the later file with "-- nexper:contract"`);
    }
  }
  return problems;
}

// ---------- run ----------
const t = counter();
const db = await buildDb();
const real = await checkCatalog(db);
for (const p of real) console.log("PROBLEM:", p);
t.ok(real.length === 0, `the real schema passes every rule (${real.length} problem(s))`);
t.ok((await rows(db, `select count(*)::int c from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`))[0].c === Object.keys(TABLES).length, "every table is listed in tests/db/tables.mjs");

// The anon-callable allow-list is only valid while those functions answer false to visitors.
await db.exec(`reset role; set role anon;`);
for (const fn of Object.keys(ANON_CALLABLE)) {
  const [{ v }] = await rows(db, `select ${fn}(gen_random_uuid()) v`);
  t.ok(v === false, `${fn} answers false for a visitor who is not signed in`);
}
await db.exec(`reset role;`);

// ---------- prove each rule can fail ----------
async function brokenWith(sql, opts) {
  const d = await buildDb();
  await d.exec(sql);
  return checkCatalog(d, opts);
}
const has = (list, rule, word) => list.some((p) => p.startsWith(rule) && p.includes(word));
{
  const p = await brokenWith(`create table dummy_things (id int, shop_id uuid);`);
  t.ok(has(p, "S2", "dummy_things"), "a new table without row-level security fails S2");
  t.ok(has(p, "S6", "dummy_things"), "a new unclassified table fails S6");
  const p2 = await brokenWith(`create table dummy_things (id int, shop_id uuid);`, { tables: { ...TABLES, dummy_things: { kind: "shop", lifecycle: "with-shop" } } });
  t.ok(has(p2, "S3", "dummy_things"), "a shop_id without a cascading foreign key fails S3");
  t.ok(has(p2, "S4", "dummy_things"), "a shop_id without an index fails S4");
}
{
  const p = await brokenWith(`create table dummy_ok (id int, shop_id uuid references shops(id) on delete cascade); alter table dummy_ok enable row level security;`, { tables: { ...TABLES, dummy_ok: { kind: "shop", lifecycle: "with-shop" } } });
  t.ok(has(p, "S4", "dummy_ok") && !has(p, "S3", "dummy_ok") && !has(p, "S6", "dummy_ok"), "classified + cascade but no index: only S4 fails");
  const p2 = await brokenWith(`create table dummy_ok (id int, shop_id uuid references shops(id) on delete cascade); create index on dummy_ok (shop_id); alter table dummy_ok enable row level security;`, { tables: { ...TABLES, dummy_ok: { kind: "shop", lifecycle: "with-shop" } } });
  t.ok(p2.length === 0, "a table that follows every rule passes");
}
{
  const p = await brokenWith(`create function sneaky() returns int language sql security definer as $$ select 1 $$;`);
  t.ok(has(p, "S5", "sneaky"), "a definer function without search_path fails S5");
  const p2 = await brokenWith(`create function open_door() returns int language sql security definer set search_path = public as $$ select 1 $$;`);
  t.ok(has(p2, "S5", "open_door") && p2.some((x) => x.includes("anon")), "a definer function callable by anon fails S5");
  const p3 = await brokenWith(`create function closed_door() returns int language sql security definer set search_path = public as $$ select 1 $$; revoke all on function closed_door() from public, anon;`);
  t.ok(p3.length === 0, "a definer function that follows the rules passes");
}
{
  const p = await brokenWith(`select 1`, { tables: { ...TABLES, bills: { ...TABLES.bills, appendOnly: true } } });
  t.ok(has(p, "S7", "bills"), "an append-only table that can be updated fails S7");
  const p2 = await brokenWith(`select 1`, { tables: { ...TABLES, ghost_table: { kind: "shop", lifecycle: "with-shop" } } });
  t.ok(has(p2, "S6", "ghost_table"), "a classified table that does not exist fails S6");
}
{
  // S8 on files in a temporary folder
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexper-cat-"));
  fs.mkdirSync(dir + "/migrations");
  fs.writeFileSync(dir + "/migrations/037_a.sql", "create table x (id int);\n");
  fs.writeFileSync(dir + "/migrations/038_b.sql", "alter table x drop column id;\nselect record_migration('038', '038_b.sql');\n");
  fs.writeFileSync(dir + "/migrations/039_c.sql", "-- nexper:contract\nalter table x drop column id;\nselect record_migration('039', '039_c.sql');\n");
  const p = await checkCatalog(db, { migrationsDir: dir + "/migrations" });
  t.ok(has(p, "S8", "037_a.sql"), "an update that does not record itself fails S8");
  t.ok(has(p, "S8", "038_b.sql") && p.some((x) => x.includes("038_b.sql") && x.includes("drops")), "an update that drops a column without the contract marker fails S8");
  t.ok(!p.some((x) => x.includes("039_c.sql")), "a marked contract update passes S8");
}

console.log(`${t.pass} passed, ${t.fail} failed (catalog rules)`);
process.exit(t.fail ? 1 : 0);
