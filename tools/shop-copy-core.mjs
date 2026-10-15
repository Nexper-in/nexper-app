// Copy one shop's books out of a database and into another (or back into the same one).
// Used for restoring one shop from a backup, for moving a company to its own project, and
// by the owner-facing data.json. client: { run(sql), rows(sql, params) } as in migrate-core.mjs.
//
// Modes of importShop:
//   missing-only  add rows that are gone, leave everything that exists (the safe default)
//   replace       first remove THIS shop's rows, then load the file: the shop is put back
//                 exactly as it was in the file. Owner's shared items and suppliers are
//                 never removed (other shops may use them).
// Either way only rows of the one shop are read, added or removed: never another shop's.
// A dry run does everything inside a transaction and rolls it back, so the counts are real.
import { SHOP_EXPORT, EXPORT_FORMAT } from "../lib/shopTables.js";

const q = (name) => `"${name}"`;
const text = (v) => (typeof v === "string" ? v : JSON.stringify(v));

function selectFor(spec, ref) {
  const t = q(spec.table);
  switch (spec.by) {
    case "self":
      return { sql: `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${t} x where x.id = $1`, params: [ref] };
    case "shop":
      return { sql: `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${t} x where x.shop_id = $1${spec.notNull ? ` and x.${q(spec.notNull)} is null` : ""}`, params: [ref] };
    case "child":
      return { sql: `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${t} x where x.${q(spec.fk)} in (select id from ${q(spec.parent)} where shop_id = $1)`, params: [ref] };
    case "owner":
      return { sql: `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${t} x where x.id in (select ${q(spec.fk)} from ${q(spec.via)} where shop_id = $1)`, params: [ref] };
    default:
      throw new Error("unknown export kind " + spec.by);
  }
}

export async function exportShop(client, shopId) {
  const shop = (await client.rows(`select id, name, owner_id, org_id from shops where id = $1`, [shopId]))[0];
  if (!shop) throw new Error("That shop is not in this database.");
  const [{ v }] = await client.rows(`select db_version() as v`);
  const company = (await client.rows(`select to_jsonb(o) as o from organisations o where o.id = $1`, [shop.org_id]))[0]?.o || null;
  const tables = {};
  for (const spec of SHOP_EXPORT) {
    const { sql, params } = selectFor(spec, shopId);
    const [{ rows }] = await client.rows(sql, params);
    tables[spec.table] = typeof rows === "string" ? JSON.parse(rows) : rows;
  }
  return { format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), dbVersion: v, shopId, company, tables };
}

export async function importShop(client, data, { mode = "missing-only", dryRun = false } = {}) {
  if (!data || data.format !== EXPORT_FORMAT) throw new Error("This file is not a Nexper shop export (wrong format).");
  if (!["missing-only", "replace"].includes(mode)) throw new Error("mode must be missing-only or replace");
  const shopRow = data.tables?.shops?.[0];
  if (!shopRow || shopRow.id !== data.shopId) throw new Error("The file does not contain its shop.");

  const [{ v }] = await client.rows(`select db_version() as v`);
  if (v !== data.dbVersion) {
    throw new Error(`The file was made at database update ${data.dbVersion} but this database is at ${v}. Bring both to the same update first (npm run db:migrate).`);
  }
  const owner = await client.rows(`select 1 from auth.users where id = $1`, [shopRow.owner_id]);
  if (!owner.length) throw new Error("The shop's owner has no sign-in account in this database. Restore the sign-in accounts first (docs/RUNBOOK_RESTORE.md).");

  const report = { mode, dryRun, tables: {} };
  await client.run("begin");
  try {
    // The server's rights, so the guards on companies and shops let a restore through.
    await client.rows(`select set_config('request.jwt.claim.role', 'service_role', true)`);

    // The company must exist before the shop that belongs to it.
    if (data.company) {
      const exists = await client.rows(`select 1 from organisations where id = $1`, [data.company.id]);
      if (!exists.length) {
        const byOwner = await client.rows(`select id from organisations where owner_id = $1`, [data.company.owner_id]);
        if (byOwner.length) throw new Error("The owner already has a different company here; restore into the company they have.");
        await client.rows(`insert into organisations (id, name, owner_id, max_shops) values ($1, $2, $3, $4)`, [data.company.id, data.company.name, data.company.owner_id, data.company.max_shops]);
        await client.rows(`insert into org_members (org_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing`, [data.company.id, data.company.owner_id]);
        report.company = "created";
      }
    }

    if (mode === "replace") {
      // children first. Not: the shop row, its members, or the owner's shared items.
      for (const spec of [...SHOP_EXPORT].reverse()) {
        if (!["shop", "child"].includes(spec.by) || spec.table === "shop_members") continue;
        const where =
          spec.by === "shop"
            ? `shop_id = $1`
            : `${q(spec.fk)} in (select id from ${q(spec.parent)} where shop_id = $1)`;
        const del = await client.rows(`with d as (delete from ${q(spec.table)} where ${where} returning 1) select count(*)::int as c from d`, [data.shopId]);
        report.tables[spec.table] = { removed: del[0].c };
      }
    }

    for (const spec of SHOP_EXPORT) {
      const rows = data.tables[spec.table] || [];
      const t = q(spec.table);
      const already = (report.tables[spec.table] ||= {});
      if (!rows.length) {
        Object.assign(already, { inserted: 0, skipped: 0 });
        continue;
      }
      // Rows that point at someone with no account here (a staff member) are left out and counted.
      // The shop row is skipped when it exists: its insert guards would count it against the
      // company's limit even though nothing is added.
      let where = "";
      if (spec.table === "shop_members") where = " where src.user_id in (select id from auth.users)";
      if (spec.table === "shops") where = " where not exists (select 1 from shops s where s.id = src.id)";
      const res = await client.rows(
        `with src as (select * from jsonb_populate_recordset(null::${t}, $1::jsonb)),
              ins as (insert into ${t} select * from src${where} on conflict do nothing returning 1)
         select count(*)::int as c from ins`,
        [text(rows)]
      );
      already.inserted = res[0].c;
      already.skipped = rows.length - res[0].c;
    }
    await client.run(dryRun ? "rollback" : "commit");
  } catch (e) {
    await client.run("rollback").catch(() => {});
    throw e;
  }
  return report;
}
