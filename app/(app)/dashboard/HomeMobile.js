"use client";

import { ChevronDown } from "lucide-react";
import { StartedCard, TodayHero, NewBillAndQuick, AttentionList, StatCards, WeekChart, TopCategories, TopCustomers, RecentMovement } from "./HomeParts";

// Phone view: today's sales, New bill, three shortcuts and what needs you.
// Charts and stats are one tap away under "More insights".
export default function HomeMobile({ vm }) {
  const { t, showInsights, setShowInsights } = vm;
  return (
    <div className="pt-5 pb-4 max-w-2xl">
      <TodayHero vm={vm} />
      <NewBillAndQuick vm={vm} />
      <StartedCard vm={vm} />
      <AttentionList vm={vm} />

      {/* Everything else, folded away */}
      <button
        onClick={() => setShowInsights((v) => !v)}
        aria-expanded={showInsights}
        className="w-full flex items-center justify-between text-sm font-semibold py-2"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("More insights")}
        <ChevronDown size={16} className={`transition-transform ${showInsights ? "rotate-180" : ""}`} />
      </button>

      {showInsights && (
        <div className="space-y-4 mt-2 ks-fade-up">
          <StatCards vm={vm} />
          <WeekChart vm={vm} />
          <TopCategories vm={vm} />
          <TopCustomers vm={vm} />
          <RecentMovement vm={vm} />
        </div>
      )}
    </div>
  );
}
