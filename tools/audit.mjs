// npm audit, failing on high/critical advisories EXCEPT the ones listed below.
// Every exception needs a reason and a date to look at it again.
import { spawnSync } from "node:child_process";

const ALLOWED = {
  // braces <=3.0.3 (no fixed release exists). Only reached through build-time
  // tooling (tailwind, next-pwa globbing our own config), never user input.
  // Re-check when braces publishes a fix. Added 2026-10-05.
  "GHSA-vfj7-8cjw-p6xm": "braces: build-time only, no fix published",
};

const r = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
const report = JSON.parse(r.stdout || "{}");
const bad = [];
for (const [name, v] of Object.entries(report.vulnerabilities || {})) {
  if (!["high", "critical"].includes(v.severity)) continue;
  const advisories = v.via.filter((x) => typeof x === "object");
  // A package with only allowed advisories (or only inherited ones) is fine.
  const open = advisories.filter((a) => !ALLOWED[(a.url || "").split("/").pop()]);
  const inheritedOnly = advisories.length === 0;
  if (open.length) bad.push(`${name}: ${open.map((a) => a.title).join("; ")}`);
  else if (inheritedOnly) {
    const parents = v.via.filter((x) => typeof x === "string");
    const unresolved = parents.filter((p) => report.vulnerabilities[p] && bad.includes(p));
    if (unresolved.length) bad.push(name);
  }
}
if (bad.length) {
  console.error("Unaccepted audit findings:\n - " + bad.join("\n - "));
  process.exit(1);
}
console.log("audit OK (allowed:", Object.keys(ALLOWED).join(", ") + ")");
