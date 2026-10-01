"use client";

import { useEffect } from "react";

// Copies each column heading onto the cells under it (data-label), so the
// "ks-stack" tables can show "Label  value" rows on phones. Runs on every
// screen and again whenever the page content changes.
export default function StackTables() {
  useEffect(() => {
    let frame = 0;
    const label = () => {
      document.querySelectorAll("table.ks-stack").forEach((table) => {
        const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
        table.querySelectorAll("tbody tr").forEach((tr) => {
          let col = 0;
          [...tr.children].forEach((td) => {
            if (td.colSpan > 1) return;
            const text = heads[col] ?? "";
            if (td.getAttribute("data-label") !== text) td.setAttribute("data-label", text);
            col += 1;
          });
        });
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(label);
    };
    label();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return null;
}
