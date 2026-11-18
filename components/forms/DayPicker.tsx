"use client";

import { Day, DAY_SHORT, DAYS } from "@/lib/types";

const PRESETS: { label: string; days: Day[] }[] = [
  { label: "Weekdays", days: [0, 1, 2, 3, 4] },
  { label: "Weekend", days: [5, 6] },
  { label: "Every day", days: [...DAYS] },
];

export function DayPicker({ value, onChange }: { value: Day[]; onChange: (days: Day[]) => void }) {
  const toggle = (d: Day) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort() as Day[]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Days of week">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={value.includes(d)}
            onClick={() => toggle(d)}
            className={`h-8 w-10 rounded-md text-xs font-medium ${value.includes(d) ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}
          >
            {DAY_SHORT[d]}
          </button>
        ))}
      </div>
      <div className="flex gap-2 text-xs">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline" onClick={() => onChange(p.days)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
