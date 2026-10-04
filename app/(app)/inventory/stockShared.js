import { T } from "@/lib/i18n";

export function stockLevelOf(i) {
  if (i.stock <= i.low_at) return "low";
  if (i.stock <= i.low_at * 3) return "medium";
  return "good";
}
export const STOCK_RANK = { low: 0, medium: 1, good: 2 };
export const STOCK_META = {
  low: { label: T("LOW"), text: "var(--danger)", bg: "var(--danger-soft)" },
  medium: { label: T("MEDIUM"), text: "var(--warn)", bg: "var(--warn-soft)" },
  good: { label: T("IN STOCK"), text: "var(--success)", bg: "var(--success-soft)" },
};
