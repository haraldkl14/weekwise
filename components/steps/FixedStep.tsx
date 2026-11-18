"use client";

import { useMemo, useState } from "react";
import { DAY_SHORT, FixedCommitments, SleepTimes, TimeBlock } from "@/lib/types";
import { availableMinutes, findOverlaps, formatHours, lockedIntervals, sleepWarnings } from "@/lib/time";
import { emptyBlock } from "@/lib/defaults";
import { WeekCalendar } from "../WeekCalendar";
import { Alert, Button, Card, Field, inputClass } from "../ui";
import { TimeBlockForm } from "../forms/TimeBlockForm";

export function describeDays(days: TimeBlock["days"]): string {
  const s = [...days].sort().join(",");
  if (s === "0,1,2,3,4") return "Mon–Fri";
  if (s === "5,6") return "Sat–Sun";
  if (s === "0,1,2,3,4,5,6") return "Every day";
  return [...days].sort().map((d) => DAY_SHORT[d]).join(", ");
}

function BlockSection({
  title,
  description,
  blocks,
  namePlaceholder,
  onChange,
}: {
  title: string;
  description: string;
  blocks: TimeBlock[];
  namePlaceholder: string;
  onChange: (blocks: TimeBlock[]) => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <Card
      title={title}
      description={description}
      actions={
        editing !== "new" && (
          <Button variant="secondary" onClick={() => setEditing("new")}>
            + Add
          </Button>
        )
      }
    >
      <ul className="flex flex-col gap-2">
        {blocks.map((b) =>
          editing === b.id ? (
            <li key={b.id}>
              <TimeBlockForm
                initial={b}
                submitLabel="Save"
                namePlaceholder={namePlaceholder}
                onSubmit={(nb) => {
                  onChange(blocks.map((x) => (x.id === b.id ? nb : x)));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{b.name}</p>
                <p className="text-xs text-zinc-500">
                  {describeDays(b.days)} · {b.start}–{b.end}
                  {b.end <= b.start ? " (+1 day)" : ""}
                </p>
              </div>
              <div className="flex shrink-0">
                <Button variant="ghost" onClick={() => setEditing(b.id)} aria-label={`Edit ${b.name}`}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => onChange(blocks.filter((x) => x.id !== b.id))} aria-label={`Delete ${b.name}`}>
                  Delete
                </Button>
              </div>
            </li>
          ),
        )}
        {blocks.length === 0 && editing !== "new" && <li className="text-sm text-zinc-400">Nothing added yet.</li>}
      </ul>
      {editing === "new" && (
        <div className="mt-2">
          <TimeBlockForm
            initial={emptyBlock()}
            submitLabel="Add"
            namePlaceholder={namePlaceholder}
            onSubmit={(b) => {
              onChange([...blocks, b]);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
    </Card>
  );
}

function SleepRow({ label, value, onChange }: { label: string; value: SleepTimes; onChange: (v: SleepTimes) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={`${label} bedtime`}>
        <input type="time" step={900} className={inputClass} value={value.bedtime} onChange={(e) => e.target.value && onChange({ ...value, bedtime: e.target.value })} />
      </Field>
      <Field label={`${label} wake-up`}>
        <input type="time" step={900} className={inputClass} value={value.wake} onChange={(e) => e.target.value && onChange({ ...value, wake: e.target.value })} />
      </Field>
    </div>
  );
}

export function FixedStep({ fixed, setFixed, onNext }: { fixed: FixedCommitments; setFixed: (f: FixedCommitments) => void; onNext: () => void }) {
  const locked = useMemo(() => lockedIntervals(fixed), [fixed]);
  const overlaps = useMemo(() => findOverlaps(fixed), [fixed]);
  const free = useMemo(() => availableMinutes(fixed), [fixed]);
  const sleepIssues = useMemo(() => sleepWarnings(fixed.sleep), [fixed.sleep]);
  const { sleep } = fixed;

  return (
    <div className="grid gap-5 xl:grid-cols-[26rem_1fr]">
      <div className="flex flex-col gap-4">
        <Card title="Sleep" description="Times after midnight (e.g. 00:30) count as the same night.">
          <div className="flex flex-col gap-3">
            <SleepRow
              label={sleep.splitWeekend ? "Weekday" : ""}
              value={sleep.weekday}
              onChange={(weekday) => setFixed({ ...fixed, sleep: { ...sleep, weekday } })}
            />
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-zinc-900"
                checked={sleep.splitWeekend}
                onChange={(e) => setFixed({ ...fixed, sleep: { ...sleep, splitWeekend: e.target.checked } })}
              />
              Different times on weekends
            </label>
            {sleep.splitWeekend && (
              <>
                <SleepRow label="Weekend" value={sleep.weekend} onChange={(weekend) => setFixed({ ...fixed, sleep: { ...sleep, weekend } })} />
                <p className="text-xs text-zinc-500">Weekend bedtime applies to Friday and Saturday nights, weekend wake-up to Saturday and Sunday mornings.</p>
              </>
            )}
            {sleepIssues.map((w) => (
              <Alert key={w} tone="warning">
                {w}
              </Alert>
            ))}
          </div>
        </Card>

        <BlockSection
          title="Recurring events"
          description="Work, classes, commutes… nothing else will be scheduled here."
          blocks={fixed.events}
          namePlaceholder="e.g. Work"
          onChange={(events) => setFixed({ ...fixed, events })}
        />

        <BlockSection
          title="Protected free time"
          description="Personal time that must stay empty."
          blocks={fixed.freeTime}
          namePlaceholder="e.g. Family dinner"
          onChange={(freeTime) => setFixed({ ...fixed, freeTime })}
        />

        <Card title="Buffer" description="Kept free before and after each recurring event.">
          <Field label="Minutes">
            <select className={`${inputClass} w-32`} value={fixed.bufferMinutes} onChange={(e) => setFixed({ ...fixed, bufferMinutes: Number(e.target.value) })}>
              {[0, 5, 10, 15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {overlaps.length > 0 && (
          <Alert tone="warning">
            <p className="font-medium">Some blocks overlap:</p>
            <ul className="mt-1 list-disc pl-5">
              {overlaps.map((o) => (
                <li key={o.message}>{o.message}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">That’s allowed, but double-check it’s intended.</p>
          </Alert>
        )}
        <WeekCalendar locked={locked} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600">
            Free for activities: <span className="font-semibold text-zinc-900">{formatHours(free)}</span> per week
          </p>
          <Button onClick={onNext}>Next: activities →</Button>
        </div>
      </div>
    </div>
  );
}
