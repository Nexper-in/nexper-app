// Small CSV reader/writer. No dependencies; handles quotes, doubled quotes,
// commas/semicolons/tabs, CRLF and a byte-order mark (Excel and bank exports).

export function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  // Pick the separator that appears most on the first non-empty line.
  const first = src.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = [",", ";", "\t", "|"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

// Quotes a value for CSV. Also neutralises spreadsheet formulas: a cell that
// starts with = + - @ is prefixed with an apostrophe so it cannot run in Excel.
export function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+@]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
