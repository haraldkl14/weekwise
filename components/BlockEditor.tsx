"use client";

import { useMemo, useState } from "react";
import { Activity, Day, DAY_LONG, DAYS } from "@/lib/types";
import { formatHHMM, formatHours, isValidHHMM, parseHHMM } from "@/lib/time";
import { overlapping, sameTitleBlocks, timeError, WeekBlock } from "@/lib/schedule/week";
import { Button, Field, inputClass } from "./ui";

const KIND_NOTE: Record<WeekBlock["kind"], string | null> = {
  activity: null,
  event: "Fixed event: changes apply to this day of this plan only. To change it every week, edit step 1 and regenerate.",
  free: "Protected free time: changes apply to this day of this plan only.",
  sleep: "Sleep: changes apply to this day of this plan only.",
};

/** "00:00" as an end time means midnight at the end of the day. */
function parseEnd(value: string, start: number): number {
  if (!isValidHHMM(value)) return NaN;
  const m = parseHHMM(value);
  return m === 0 && start > 0 ? 1440 : m;
}

export function BlockEditor({
  initial,
  isNew,
  blocks,
  activities,
  onSave,
  onDelete,
  onClose,
}: {
  initial: WeekBlock;
  isNew: boolean;
  blocks: WeekBlock[];
  activities: Activity[];
  onSave: (block: WeekBlock, renameAll: boolean) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [startText, setStartText] = useState(formatHHMM(initial.start));
  const [endText, setEndText] = useState(formatHHMM(initial.end % 1440));
  const [renameAll, setRenameAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = isValidHHMM(startText) ? parseHHMM(startText) : NaN;
  const end = parseEnd(endText, start);
  const times = timeError(start, end);
  const isActivity = draft.kind === "activity";
  const siblings = useMemo(() => (isNew ? [] : sameTitleBlocks(blocks, initial.id)), [blocks, initial.id, isNew]);
  const renamed = draft.title.trim() !== initial.title;
  const clashes = times ? [] : overlapping(blocks, { id: draft.id, day: draft.day, start, end });

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return setError("Give it a name.");
    if (times) return setError(times);
    onSave({ ...draft, title: draft.title.trim(), start, end }, renameAll && renamed && siblings.length > 1);
  }

  function link(activityId: string) {
    const a = activities.find((x) => x.id === activityId);
    setDraft(a ? { ...draft, activityId: a.id, title: a.name, color: a.color } : { ...draft, activityId: undefined });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">{isNew ? "Add activity" : `Edit ${initial.title}`}</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
          ✕
        </button>
      </div>

      {KIND_NOTE[draft.kind] && <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{KIND_NOTE[draft.kind]}</p>}

      {isActivity && activities.length > 0 && (
        <Field label="Counts toward" hint="Linked blocks count toward that activity’s weekly hours.">
          <select className={inputClass} value={draft.activityId ?? ""} onChange={(e) => link(e.target.value)}>
            <option value="">Nothing (one-off)</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Name">
          <input
            autoFocus={isNew}
            className={inputClass}
            value={draft.title}
            maxLength={80}
            placeholder="e.g. Piano practice"
            onChange={(e) => {
              setDraft({ ...draft, title: e.target.value });
              setError(null);
            }}
          />
        </Field>
        {isActivity && (
          <Field label="Color">
            <input
              type="color"
              className="h-[34px] w-14 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
              value={draft.color ?? "#71717a"}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            />
          </Field>
        )}
      </div>

      {!isNew && renamed && siblings.length > 1 && (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" className="h-4 w-4 accent-zinc-900" checked={renameAll} onChange={(e) => setRenameAll(e.target.checked)} />
          Also rename the other {siblings.length - 1} “{initial.title}” block{siblings.length > 2 ? "s" : ""}
        </label>
      )}

      <Field label="Day">
        <select className={inputClass} value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) as Day })}>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {DAY_LONG[d]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <input type="time" step={300} className={inputClass} value={startText} onChange={(e) => setStartText(e.target.value)} />
        </Field>
        <Field label="End" hint={times ? undefined : `${formatHours(end - start)}`}>
          <input type="time" step={300} className={inputClass} value={endText} onChange={(e) => setEndText(e.target.value)} />
        </Field>
      </div>

      {clashes.length > 0 && (
        <p className="text-xs text-amber-700">
          Overlaps {[...new Set(clashes.map((c) => c.title))].join(", ")}. That’s allowed; both will be shown side by side.
        </p>
      )}
      {(error || times) && <p className="text-sm text-red-600">{error ?? times}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">{isNew ? "Add" : "Save"}</Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {onDelete && (
          <Button variant="danger" className="ml-auto" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
