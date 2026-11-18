"use client";

import { useMemo, useState } from "react";
import { Activity, FixedCommitments } from "@/lib/types";
import { capacity, formatHours, planSessions } from "@/lib/time";
import { emptyActivity } from "@/lib/defaults";
import { Alert, Button, Card } from "../ui";
import { ActivityForm } from "../forms/ActivityForm";

const TOD_LABEL = { any: "any time", morning: "mornings", afternoon: "afternoons", evening: "evenings" } as const;

export function ActivitiesStep({
  fixed,
  activities,
  setActivities,
  onBack,
  onGenerate,
}: {
  fixed: FixedCommitments;
  activities: Activity[];
  setActivities: (a: Activity[]) => void;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(activities.length === 0 ? "new" : null);
  const cap = useMemo(() => capacity(fixed, activities), [fixed, activities]);
  const problems = useMemo(() => activities.map((a) => planSessions(a).problem).filter(Boolean) as string[], [activities]);
  const canGenerate = cap.canGenerate && problems.length === 0 && editing === null;
  const pct = cap.availableMinutes ? Math.min(100, (cap.requestedMinutes / cap.availableMinutes) * 100) : 100;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="sticky top-0 z-30 rounded-xl border border-zinc-200 bg-white/95 p-4 backdrop-blur">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <p>
            Available hours: <span className="font-semibold">{formatHours(cap.availableMinutes)}</span>
            <span className="mx-2 text-zinc-300">|</span>
            Requested hours: <span className={`font-semibold ${cap.overByMinutes ? "text-red-600" : ""}`}>{formatHours(cap.requestedMinutes)}</span>
          </p>
          {cap.overByMinutes === 0 && activities.length > 0 && (
            <p className="text-zinc-500">{formatHours(cap.availableMinutes - cap.requestedMinutes)} left free</p>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div className={`h-full rounded-full transition-all ${cap.overByMinutes ? "bg-red-500" : "bg-zinc-900"}`} style={{ width: `${pct}%` }} />
        </div>
        {cap.overByMinutes > 0 && (
          <p className="mt-2 text-sm font-medium text-red-600">
            That’s {formatHours(cap.overByMinutes)} more than you have. Cut at least {formatHours(cap.overByMinutes)} to generate a schedule.
          </p>
        )}
        {cap.overByMinutes === 0 && cap.requestedMinutes > cap.availableMinutes * 0.85 && (
          <p className="mt-2 text-xs text-amber-700">
            Your week is nearly full. Short gaps between commitments may not fit your minimum session lengths, so some activities could fall short.
          </p>
        )}
      </div>

      <Card
        title="Activities"
        description="What do you want to fit into your free time?"
        actions={
          editing !== "new" && (
            <Button variant="secondary" onClick={() => setEditing("new")}>
              + Add
            </Button>
          )
        }
      >
        <ul className="flex flex-col gap-2">
          {activities.map((a) =>
            editing === a.id ? (
              <li key={a.id}>
                <ActivityForm
                  initial={a}
                  submitLabel="Save"
                  onSubmit={(na) => {
                    setActivities(activities.map((x) => (x.id === a.id ? na : x)));
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{a.name}</p>
                    <p className="text-xs text-zinc-500">
                      {a.hoursPerWeek}h/week · {a.minSessionHours === a.maxSessionHours ? `${a.minSessionHours}h` : `${a.minSessionHours}–${a.maxSessionHours}h`} sessions ·{" "}
                      {TOD_LABEL[a.timeOfDay]}
                    </p>
                    {a.notes && <p className="truncate text-xs italic text-zinc-400">“{a.notes}”</p>}
                  </div>
                </div>
                <div className="flex shrink-0">
                  <Button variant="ghost" onClick={() => setEditing(a.id)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => setActivities(activities.filter((x) => x.id !== a.id))}>
                    Delete
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
        {editing === "new" && (
          <div className="mt-2">
            <ActivityForm
              initial={emptyActivity(activities.length)}
              submitLabel="Add activity"
              onSubmit={(a) => {
                setActivities([...activities, a]);
                setEditing(null);
              }}
              onCancel={activities.length ? () => setEditing(null) : undefined}
            />
          </div>
        )}
      </Card>

      {problems.length > 0 && (
        <Alert tone="error">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onGenerate} disabled={!canGenerate} title={editing !== null ? "Finish editing first" : undefined}>
          Generate schedule →
        </Button>
      </div>
    </div>
  );
}
