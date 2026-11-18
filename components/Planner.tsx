"use client";

import { useMemo, useState } from "react";
import { Activity, FixedCommitments, GeneratedSchedule, Placement } from "@/lib/types";
import { capacity, planSessions } from "@/lib/time";
import { defaultFixed, exampleData } from "@/lib/defaults";
import { deterministicSchedule, PlanningInputError } from "@/lib/schedule/generate";
import { requestSchedule } from "@/lib/api";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Stepper } from "./Stepper";
import { FixedStep } from "./steps/FixedStep";
import { ActivitiesStep } from "./steps/ActivitiesStep";
import { GenState, ScheduleStep } from "./steps/ScheduleStep";
import { Button } from "./ui";

interface StoredSchedule {
  schedule: GeneratedSchedule;
  /** Snapshot key of the inputs the schedule was built from. */
  basedOn: string;
}

const KEY = "weekly-planner:v1";
const inputsKey = (fixed: FixedCommitments, activities: Activity[]) => JSON.stringify([fixed, activities]);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export default function Planner() {
  const [fixed, setFixed] = usePersistentState<FixedCommitments>(`${KEY}:fixed`, defaultFixed, (v): v is FixedCommitments =>
    isObj(v) && Array.isArray(v.events) && Array.isArray(v.freeTime) && isObj(v.sleep),
  );
  const [activities, setActivities] = usePersistentState<Activity[]>(`${KEY}:activities`, () => [], Array.isArray as (v: unknown) => v is Activity[]);
  const [stored, setStored] = usePersistentState<StoredSchedule | null>(`${KEY}:schedule`, () => null);
  const [step, setStep] = usePersistentState<number>(`${KEY}:step`, () => 1);
  const [gen, setGen] = useState<GenState>({ status: "idle" });

  const key = inputsKey(fixed, activities);
  const canGenerate = useMemo(
    () => capacity(fixed, activities).canGenerate && activities.every((a) => !planSessions(a).problem),
    [fixed, activities],
  );
  // Drop sessions whose activity was deleted since the schedule was made.
  const schedule = useMemo(() => {
    if (!stored) return null;
    const ids = new Set(activities.map((a) => a.id));
    return { ...stored.schedule, placements: stored.schedule.placements.filter((p) => ids.has(p.activityId)) };
  }, [stored, activities]);

  async function generate() {
    setStep(3);
    setGen({ status: "loading" });
    const res = await requestSchedule(fixed, activities);
    if (res.ok) {
      setStored({ schedule: res.schedule, basedOn: key });
      setGen({ status: "idle" });
    } else {
      setGen({ status: "error", error: res.error });
    }
  }

  function fallback() {
    try {
      setStored({ schedule: deterministicSchedule(fixed, activities), basedOn: key });
      setGen({ status: "idle" });
    } catch (e) {
      const problems = e instanceof PlanningInputError ? e.problems : ["Unexpected error."];
      setGen({ status: "error", error: { code: "invalid_input", message: problems[0], problems } });
    }
  }

  function updatePlacements(placements: Placement[]) {
    if (!stored) return;
    setStored({ ...stored, schedule: { ...stored.schedule, placements, source: "manual" } });
  }

  function loadExample() {
    const ex = exampleData();
    setFixed(ex.fixed);
    setActivities(ex.activities);
    setStored(null);
    setStep(1);
  }

  function reset() {
    if (!window.confirm("Clear all commitments, activities and the schedule?")) return;
    setFixed(defaultFixed());
    setActivities([]);
    setStored(null);
    setGen({ status: "idle" });
    setStep(1);
  }

  const maxReachable = stored || gen.status !== "idle" ? 3 : canGenerate ? 3 : 2;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Weekly Planner</h1>
          <p className="text-sm text-zinc-500">Lock in what’s fixed, list what you want to do, get a week that fits.</p>
        </div>
        <Stepper step={step} maxReachable={maxReachable} onSelect={setStep} />
      </header>

      <div className="flex gap-2 text-xs">
        <button className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline" onClick={loadExample}>
          Load example
        </button>
        <span className="text-zinc-300">·</span>
        <button className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline" onClick={reset}>
          Start over
        </button>
      </div>

      {step === 1 && <FixedStep fixed={fixed} setFixed={setFixed} onNext={() => setStep(2)} />}
      {step === 2 && (
        <ActivitiesStep fixed={fixed} activities={activities} setActivities={setActivities} onBack={() => setStep(1)} onGenerate={generate} />
      )}
      {step === 3 &&
        (schedule || gen.status !== "idle" ? (
          <ScheduleStep
            fixed={fixed}
            activities={activities}
            schedule={schedule}
            stale={Boolean(stored && stored.basedOn !== key)}
            gen={gen}
            onRegenerate={generate}
            onFallback={fallback}
            onPlacementsChange={updatePlacements}
            onBack={() => setStep(2)}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-zinc-600">No schedule yet.</p>
            <Button onClick={generate} disabled={!canGenerate}>
              Generate schedule
            </Button>
          </div>
        ))}
    </div>
  );
}
