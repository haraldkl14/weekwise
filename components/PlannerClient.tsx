"use client";

import dynamic from "next/dynamic";

// localStorage only exists in the browser; skip SSR for the planner.
const Planner = dynamic(() => import("./Planner"), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-zinc-400">Loading…</div>,
});

export function PlannerClient() {
  return <Planner />;
}
