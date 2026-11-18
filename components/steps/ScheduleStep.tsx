"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Day, DAY_LONG, DAYS, FixedCommitments, GeneratedSchedule, Placement } from "@/lib/types";
import { availableSlots, formatHHMM, formatHours, lockedIntervals, parseHHMM } from "@/lib/time";
import { summarize } from "@/lib/schedule/validate";
import { movePlacement } from "@/lib/schedule/move";
import { buildIcs, mondayOf } from "@/lib/ics";
import type { GenerateErrorBody } from "@/lib/api";
import { WeekCalendar } from "../WeekCalendar";
import { Alert, Button, Card, Field, inputClass } from "../ui";

export type GenState = { status: "idle" } | { status: "loading" } | { status: "error"; error: GenerateErrorBody["error"] };

const SOURCE_LABEL: Record<GeneratedSchedule["source"], { text: string; className: string }> = {
  ai: { text: "AI-planned · validated", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  fallback: { text: "Deterministic planner", className: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  manual: { text: "Edited by you", className: "bg-blue-50 text-blue-700 border-blue-200" },
};

export function ScheduleStep({
  fixed,
  activities,
  schedule,
  stale,
  gen,
  onRegenerate,
  onFallback,
  onPlacementsChange,
  onBack,
}: {
  fixed: FixedCommitments;
  activities: Activity[];
  schedule: GeneratedSchedule | null;
  stale: boolean;
  gen: GenState;
  onRegenerate: () => void;
  onFallback: () => void;
  onPlacementsChange: (p: Placement[]) => void;
  onBack: () => void;
}) {
  const locked = useMemo(() => lockedIntervals(fixed), [fixed]);
  const slots = useMemo(() => availableSlots(fixed), [fixed]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const placements = useMemo(() => schedule?.placements ?? [], [schedule]);
  const summary = useMemo(() => summarize(placements, activities), [placements, activities]);
  const selected = placements.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          ← Activities
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onRegenerate} disabled={gen.status === "loading"}>
            {gen.status === "loading" ? "Generating…" : "↻ Regenerate"}
          </Button>
          {schedule && <ExportButton placements={placements} activities={activities} />}
        </div>
      </div>

      {gen.status === "loading" && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            Planning your week and checking the result against your constraints…
          </span>
        </Alert>
      )}

      {gen.status === "error" && (
        <Alert tone="error">
          <p className="font-medium">Couldn’t generate an AI schedule.</p>
          <p className="mt-0.5">{gen.error.message}</p>
          {gen.error.problems && gen.error.problems.length > 1 && (
            <ul className="mt-1 list-disc pl-5">
              {gen.error.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {gen.error.fallbackAvailable && <Button onClick={onFallback}>Use the deterministic planner</Button>}
            {gen.error.code !== "invalid_input" && (
              <Button variant="secondary" onClick={onRegenerate}>
                Try again
              </Button>
            )}
          </div>
        </Alert>
      )}

      {stale && schedule && gen.status !== "loading" && (
        <Alert tone="warning">Your commitments or activities changed since this schedule was made. Regenerate to include the changes.</Alert>
      )}

      {schedule && (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Why this schedule</h2>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SOURCE_LABEL[schedule.source].className}`}>{SOURCE_LABEL[schedule.source].text}</span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-700">{schedule.explanation}</p>
            {schedule.warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                {schedule.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-zinc-500">
                <span className="hidden md:inline">Drag a session to move it, or click it to pick a new time.</span>
                <span className="md:hidden">Tap a session to move it.</span> Locked time can’t be used.
              </p>
              <WeekCalendar
                locked={locked}
                placements={placements}
                activities={activities}
                slots={slots}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPlacementsChange={(p) => {
                  onPlacementsChange(p);
                  setToast(null);
                }}
                onReject={setToast}
              />
            </div>

            <div className="flex flex-col gap-4">
              {selected && (
                <MovePanel
                  key={selected.id}
                  placement={selected}
                  activity={activities.find((a) => a.id === selected.activityId)}
                  onClose={() => setSelectedId(null)}
                  onMove={(day, start) => {
                    const res = movePlacement(placements, selected.id, day, start, slots);
                    if (!res.ok) return res.reason;
                    onPlacementsChange(res.placements);
                    setSelectedId(null);
                    return null;
                  }}
                />
              )}
              <Card title="Hours per activity">
                <ul className="flex flex-col gap-3">
                  {summary.map((s) => (
                    <li key={s.activityId}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </span>
                        <span className={s.onTarget ? "text-zinc-600" : "font-medium text-red-600"}>
                          {formatHours(s.scheduledMinutes)} / {formatHours(s.targetMinutes)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, (s.scheduledMinutes / s.targetMinutes) * 100)}%`, backgroundColor: s.color }}
                        />
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {s.sessions} session{s.sessions === 1 ? "" : "s"}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function MovePanel({
  placement,
  activity,
  onMove,
  onClose,
}: {
  placement: Placement;
  activity?: Activity;
  onMove: (day: Day, start: number) => string | null;
  onClose: () => void;
}) {
  const [day, setDay] = useState<Day>(placement.day);
  const [start, setStart] = useState(formatHHMM(placement.start));
  const [error, setError] = useState<string | null>(null);
  const len = placement.end - placement.start;

  return (
    <Card title={`Move ${activity?.name ?? "session"}`} description={`${formatHours(len)} session`}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day">
            <select className={inputClass} value={day} onChange={(e) => setDay(Number(e.target.value) as Day)}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {DAY_LONG[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start">
            <input type="time" step={900} className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button
            onClick={() => {
              if (!start) return setError("Pick a start time.");
              setError(onMove(day, parseHHMM(start)));
            }}
          >
            Move
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ExportButton({ placements, activities }: { placements: Placement[]; activities: Activity[] }) {
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<"this" | "next">("next");
  const [repeat, setRepeat] = useState(1);
  const thisMonday = mondayOf(new Date());
  const weekStart = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + (week === "next" ? 7 : 0));

  function download() {
    const ics = buildIcs(placements, activities, { weekStart, repeatWeeks: repeat });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-plan-${weekStart.toISOString().slice(0, 10)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)} aria-expanded={open}>
        Export .ics
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="flex flex-col gap-3">
            <Field label="Week">
              <select className={inputClass} value={week} onChange={(e) => setWeek(e.target.value as "this" | "next")}>
                <option value="this">This week (from {fmt(thisMonday)})</option>
                <option value="next">Next week (from {fmt(new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 7))})</option>
              </select>
            </Field>
            <Field label="Repeat">
              <select className={inputClass} value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
                <option value={1}>Just this week</option>
                <option value={4}>4 weeks</option>
                <option value={12}>12 weeks</option>
              </select>
            </Field>
            <p className="text-xs text-zinc-500">Import into Google Calendar (Settings → Import) or open with Apple Calendar.</p>
            <Button onClick={download}>Download</Button>
          </div>
        </div>
      )}
    </div>
  );
}
