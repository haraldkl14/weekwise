"use client";

import { useState } from "react";
import { Activity, TimeOfDay } from "@/lib/types";
import { planSessions } from "@/lib/time";
import { Button, Field, inputClass } from "../ui";

const isQuarter = (n: number) => Number.isFinite(n) && n > 0 && Number.isInteger(n * 4);

export function ActivityForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Activity;
  submitLabel: string;
  onSubmit: (a: Activity) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const num = (key: "hoursPerWeek" | "minSessionHours" | "maxSessionHours") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [key]: e.target.value === "" ? NaN : Number(e.target.value) });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return setError("Give the activity a name.");
    if (![draft.hoursPerWeek, draft.minSessionHours, draft.maxSessionHours].every(isQuarter)) {
      return setError("Hours must be positive and in 15-minute steps (e.g. 0.25, 1.5).");
    }
    if (draft.minSessionHours > draft.maxSessionHours) return setError("Minimum session can't be longer than the maximum.");
    const plan = planSessions(draft);
    if (plan.problem) return setError(plan.problem);
    setError(null);
    onSubmit({ ...draft, name: draft.name.trim(), notes: draft.notes.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Name">
          <input className={inputClass} value={draft.name} placeholder="e.g. Gym" maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Color">
          <input type="color" className="h-[34px] w-14 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Hours / week">
          <input type="number" min={0.25} step={0.25} className={inputClass} value={Number.isNaN(draft.hoursPerWeek) ? "" : draft.hoursPerWeek} onChange={num("hoursPerWeek")} />
        </Field>
        <Field label="Min session (h)">
          <input type="number" min={0.25} step={0.25} className={inputClass} value={Number.isNaN(draft.minSessionHours) ? "" : draft.minSessionHours} onChange={num("minSessionHours")} />
        </Field>
        <Field label="Max session (h)">
          <input type="number" min={0.25} step={0.25} className={inputClass} value={Number.isNaN(draft.maxSessionHours) ? "" : draft.maxSessionHours} onChange={num("maxSessionHours")} />
        </Field>
        <Field label="Time of day">
          <select className={inputClass} value={draft.timeOfDay} onChange={(e) => setDraft({ ...draft, timeOfDay: e.target.value as TimeOfDay })}>
            <option value="any">Any</option>
            <option value="morning">Morning (5–12)</option>
            <option value="afternoon">Afternoon (12–17)</option>
            <option value="evening">Evening (17–23)</option>
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)" hint="Used by the AI planner, e.g. “not right after dinner”, “spread across the week”.">
        <textarea className={`${inputClass} min-h-16`} maxLength={500} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit">{submitLabel}</Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
