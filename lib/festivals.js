// Ready-made offer posts for Indian festivals. Dates move every year, so each
// one only says the month it usually falls in; the owner picks the template
// and edits the words. `theme` colours the poster.
import { T } from "@/lib/i18n";

export const FESTIVALS = [
  { id: "pongal", name: T("Pongal / Sankranti"), month: 1, emoji: "🌾", theme: ["#b45309", "#f59e0b"], title: T("Pongal & Sankranti offers"), details: T("Rice, jaggery, ghee and festival essentials at special prices.") },
  { id: "holi", name: T("Holi"), month: 3, emoji: "🎨", theme: ["#db2777", "#7c3aed"], title: T("Happy Holi! Festival offers"), details: T("Sweets, snacks, cold drinks and colours. Stock up before the festival.") },
  { id: "ugadi", name: T("Ugadi / Gudi Padwa"), month: 4, emoji: "🌼", theme: ["#15803d", "#eab308"], title: T("Ugadi & Gudi Padwa offers"), details: T("Everything for your festival kitchen at special prices.") },
  { id: "eid", name: T("Eid"), month: 4, emoji: "🌙", theme: ["#047857", "#0e7490"], title: T("Eid Mubarak! Special offers"), details: T("Dry fruits, vermicelli, rice, ghee and more at festival prices.") },
  { id: "rakhi", name: T("Raksha Bandhan"), month: 8, emoji: "🪢", theme: ["#be185d", "#f59e0b"], title: T("Raksha Bandhan sweets and gifts"), details: T("Sweets, dry fruits and chocolates for your loved ones.") },
  { id: "independence", name: T("Independence Day"), month: 8, emoji: "🇮🇳", theme: ["#ea580c", "#15803d"], title: T("Independence Day special"), details: T("Celebrate with great savings on daily needs. This week only.") },
  { id: "ganesh", name: T("Ganesh Chaturthi"), month: 9, emoji: "🪔", theme: ["#c2410c", "#facc15"], title: T("Ganesh Chaturthi offers"), details: T("Modak ingredients, ghee, dry fruits and puja items at special prices.") },
  { id: "onam", name: T("Onam"), month: 9, emoji: "🌸", theme: ["#ca8a04", "#15803d"], title: T("Onam sadya essentials"), details: T("Rice, coconut oil, pulses and all you need for the feast.") },
  { id: "navratri", name: T("Navratri / Dussehra"), month: 10, emoji: "🪘", theme: ["#be123c", "#f59e0b"], title: T("Navratri and Dussehra offers"), details: T("Fasting essentials and festival groceries at special prices.") },
  { id: "diwali", name: T("Diwali"), month: 11, emoji: "🪔", theme: ["#9a3412", "#f59e0b"], title: T("Happy Diwali! Festival offers"), details: T("Dry fruits, sweets, oil, ghee and gifting packs at special prices.") },
  { id: "christmas", name: T("Christmas"), month: 12, emoji: "🎄", theme: ["#b91c1c", "#166534"], title: T("Christmas and year-end offers"), details: T("Cakes, chocolates, snacks and party needs at special prices.") },
];

// Festivals nearest to `now`, soonest first (this month, then the months ahead).
export function upcomingFestivals(now = new Date()) {
  const m = now.getMonth() + 1;
  return [...FESTIVALS].sort((a, b) => ((a.month - m + 12) % 12) - ((b.month - m + 12) % 12));
}
