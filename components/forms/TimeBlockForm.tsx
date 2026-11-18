"use client";

import { useState } from "react";
import { TimeBlock } from "@/lib/types";
import { parseHHMM } from "@/lib/time";
import { Button, Field, inputClass } from "../ui";
import { DayPicker } from "./DayPicker";

export function TimeBlockForm({
  initial,
  submitLabel,
  namePlaceholder,
  onSubmit,
  onCancel,
}: {
  initial: TimeBlock;
  submitLabel: string;
  namePlaceholder: string;
  onSubmit: (block: TimeBlock) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const crossesMidnight = draft.start && draft.end && parseHHMM(draft.end) <= parseHHMM(draft.start);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return setError("Give it a name.");
    if (draft.days.length === 0) return setError("Pick at least one day.");
    if (!draft.start || !draft.end) return setError("Set a start and end time.");
    if (draft.start === draft.end) return setError("Start and end can't be the same.");
    setError(null);
    onSubmit({ ...draft, name: draft.name.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field label="Name">
          <input className={inputClass} value={draft.name} placeholder={namePlaceholder} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Start">
          <input type="time" step={900} className={inputClass} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
        </Field>
        <Field label="End" hint={crossesMidnight ? "Ends the next day" : undefined}>
          <input type="time" step={900} className={inputClass} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
        </Field>
      </div>
      <Field label="Days">
        <DayPicker value={draft.days} onChange={(days) => setDraft({ ...draft, days })} />
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
