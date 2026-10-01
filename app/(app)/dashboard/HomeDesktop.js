"use client";

import { StartedCard, TodayHero, NewBillAndQuick, AttentionList, StatCards, WeekChart, TopCategories, TopCustomers, RecentMovement } from "./HomeParts";

// Laptop view: the whole dashboard at once. Today, New bill and what needs
// you on the left; the numbers, the week's chart and the lists on the right.
export default function HomeDesktop({ vm }) {
  return (
    <div className="pt-6 pb-6 grid gap-6 items-start" style={{ gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)" }}>
      <div className="min-w-0">
        <TodayHero vm={vm} />
        <NewBillAndQuick vm={vm} />
        <StartedCard vm={vm} />
        <AttentionList vm={vm} />
      </div>
      <div className="min-w-0 space-y-4">
        <StatCards vm={vm} wide />
        <WeekChart vm={vm} />
        <div className="grid grid-cols-2 gap-4 items-start">
          <TopCategories vm={vm} />
          <TopCustomers vm={vm} />
          <RecentMovement vm={vm} />
        </div>
      </div>
    </div>
  );
}
