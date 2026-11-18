"use client";

const STEPS = ["Fixed", "Activities", "Schedule"] as const;

export function Stepper({ step, maxReachable, onSelect }: { step: number; maxReachable: number; onSelect: (s: number) => void }) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center gap-2 sm:gap-4">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          const reachable = n <= maxReachable;
          return (
            <li key={label} className="flex items-center gap-2 sm:gap-4">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(n)}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-2 rounded-full px-1 py-1 text-sm font-medium transition disabled:cursor-not-allowed ${
                  active ? "text-zinc-900" : reachable ? "text-zinc-500 hover:text-zinc-900" : "text-zinc-300"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                    active ? "bg-zinc-900 text-white" : done ? "bg-zinc-200 text-zinc-700" : "border border-zinc-300"
                  }`}
                >
                  {done ? "✓" : n}
                </span>
                <span className={active ? "" : "hidden sm:inline"}>{label}</span>
              </button>
              {n < STEPS.length && <span className="h-px w-6 bg-zinc-300 sm:w-12" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
