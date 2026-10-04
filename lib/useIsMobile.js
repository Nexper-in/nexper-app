"use client";

import { useSyncExternalStore } from "react";

// Phone and tablet layout (the top bar + bottom tab bar) is everything under
// 1024px; the laptop layout (side menu) starts there. Same breakpoint as
// the app shell in app/globals.css. The first render is "laptop" so the
// server and browser agree; screens show a loader until data arrives anyway.
const QUERY = "(max-width: 1023px)";

function subscribe(onChange) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
