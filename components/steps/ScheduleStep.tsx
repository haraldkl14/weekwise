"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Day, GeneratedSchedule } from "@/lib/types";
import { formatHours } from "@/lib/time";
import { deleteBlock, PaletteItem, paletteItems, placeItem, renameMatching, summarizeBlocks, upsertBlock, WeekBlock } from "@/lib/schedule/week";
import { newId } from "@/lib/defaults";
import { buildIcs, mondayOf } from "@/lib/ics";
import type { GenerateErrorBody } from "@/lib/api";
import { WeekCalendar } from "../WeekCalendar";
import { BlockEditor } from "../BlockEditor";
import { Alert, Button, Card, Field, inputClass } from "../ui";

export type GenState = { status: "idle" } | { status: "loading" } | { status: "error"; error: GenerateErrorBody["error"] };

const SOURCE_LABEL: Record<GeneratedSchedule["source"], { text: string; className: string }> = {
  ai: { text: "AI-planned · validated", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  fallback: { text: "Deterministic planner", className: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  manual: { text: "Edited by you", className: "bg-blue-50 text-blue-700 border-blue-200" },
};

type Editing = { block: WeekBlock; isNew: boolean } | null;

export function ScheduleStep({
  activities,
  schedule,
  blocks,
  stale,
  gen,
  canUndo,
  onUndo,
  onRegenerate,
  onFallback,
  onBlocksChange,
  onBack,
}: {
  activities: Activity[];
  schedule: GeneratedSchedule | null;
  blocks: WeekBlock[];
  stale: boolean;
  gen: GenState;
  canUndo: boolean;
  onUndo: () => void;
  onRegenerate: () => void;
  onFallback: () => void;
  onBlocksChange: (blocks: WeekBlock[]) => void;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const summary = useMemo(() => summarizeBlocks(blocks, activities), [blocks, activities]);
  const palette = useMemo(() => new Map(paletteItems(blocks, activities).map((p) => [p.key, p])), [blocks, activities]);
  const [placing, setPlacing] = useState<{ item: PaletteItem; byDrag: boolean } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const listDrag = useRef<{ item: PaletteItem; x: number; y: number; moved: boolean } | null>(null);

  // Esc cancels placing.
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlacing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing]);

  function place(day: Day, minute: number) {
    if (!placing) return;
    onBlocksChange(placeItem(blocks, placing.item, day, minute, newId("blk")));
    setPlacing(null);
  }

  /** Mouse: press on a list item and drag it onto the calendar. */
  function startListDrag(e: React.PointerEvent, item: PaletteItem) {
    if (e.pointerType === "touch" || e.button !== 0) return;
    e.preventDefault();
    listDrag.current = { item, x: e.clientX, y: e.clientY, moved: false };
    const onMove = (ev: PointerEvent) => {
      const d = listDrag.current;
      if (!d || d.moved || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return;
      d.moved = true;
      document.body.style.cursor = "grabbing";
      setPlacing({ item: d.item, byDrag: true });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      // A drop on the calendar was already handled by its own pointerup.
      if (listDrag.current?.moved) setPlacing(null);
      listDrag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /** Click / tap / keyboard: pick the item, then click a time in the calendar. */
  function togglePlacing(item: PaletteItem) {
    setEditing(null);
    const cancel = placing?.item.key === item.key && !placing.byDrag;
    setPlacing(cancel ? null : { item, byDrag: false });
    // On narrow screens the list is below the calendar: bring the calendar into view.
    if (!cancel && window.innerWidth < 1280) calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const listRow = (item: PaletteItem | undefined, children: React.ReactNode) => {
    if (!item) return <div className="px-2 py-1.5">{children}</div>;
    const active = placing?.item.key === item.key;
    return (
      <button
        type="button"
        onPointerDown={(e) => startListDrag(e, item)}
        onClick={() => togglePlacing(item)}
        title={`Click, then click the calendar to add ${formatHours(item.minutes)} of ${item.title}, or drag it onto the calendar`}
        className={`group w-full cursor-grab touch-manipulation rounded-lg px-2 py-1.5 text-left transition hover:bg-zinc-50 active:cursor-grabbing ${
          active ? "bg-zinc-50 ring-2 ring-zinc-900" : ""
        }`}
      >
        {children}
      </button>
    );
  };

  function openEditor(id: string) {
    setPlacing(null);
    const block = blocks.find((b) => b.id === id);
    if (block) setEditing({ block, isNew: false });
  }

  function openNew(day: Day, start: number, end: number) {
    setPlacing(null);
    setEditing({ block: { id: newId("blk"), kind: "activity", title: "", color: "#0891b2", day, start, end }, isNew: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          ← Activities
        </Button>
        <div className="flex flex-wrap gap-2">
          {schedule && (
            <Button variant="secondary" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              ↶ Undo
            </Button>
          )}
          <Button variant="secondary" onClick={onRegenerate} disabled={gen.status === "loading"}>
            {gen.status === "loading" ? "Generating…" : "↻ Regenerate"}
          </Button>
          {schedule && <ExportButton blocks={blocks} />}
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

          <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
            <div ref={calendarRef} className="flex scroll-mt-4 flex-col gap-2">
              <p className="text-xs text-zinc-500">
                <span className="hidden md:inline">
                  The plan is yours to change: drag any block to move it, drag its top or bottom edge to change the start or end, click it to edit, or click
                  empty time to add an activity. Overlaps are allowed.
                </span>
                <span className="md:hidden">Tap any block to edit it, or tap empty time to add an activity. Overlaps are allowed.</span>
              </p>
              {placing && !placing.byDrag && (
                <div className="sticky top-0 z-40 flex items-center justify-between gap-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: placing.item.color }} />
                    Click a time in the calendar to add {placing.item.title} ({formatHours(placing.item.minutes)})
                  </span>
                  <button type="button" className="rounded px-2 py-0.5 text-zinc-300 hover:bg-white/10 hover:text-white" onClick={() => setPlacing(null)}>
                    Cancel
                  </button>
                </div>
              )}
              <WeekCalendar
                blocks={blocks}
                editable
                selectedId={editing && !editing.isNew ? editing.block.id : null}
                onSelect={openEditor}
                onChange={onBlocksChange}
                onAdd={openNew}
                placing={placing?.item ?? null}
                placingByDrag={placing?.byDrag ?? false}
                onPlace={place}
                onExpandedChange={setCalendarExpanded}
                expandedToolbar={
                  <Button variant="secondary" className="!py-1 text-xs" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                    ↶ Undo
                  </Button>
                }
              />
            </div>

            <div className="flex flex-col gap-4">
              {editing && (
                <>
                  {/* Bottom sheet on small screens, sidebar card on wide screens. */}
                  {/* Above the full-screen calendar when it's expanded: floating card on desktop, bottom sheet on phones. */}
                  <div
                    className={`fixed inset-0 bg-black/20 ${calendarExpanded ? "z-[55] md:hidden" : "z-40 xl:hidden"}`}
                    onClick={() => setEditing(null)}
                    aria-hidden
                  />
                  <div
                    className={
                      calendarExpanded
                        ? "fixed inset-x-0 bottom-0 z-[60] max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white p-4 shadow-2xl md:inset-x-auto md:top-16 md:right-4 md:bottom-auto md:w-[22rem] md:rounded-xl md:border md:p-5"
                        : "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white p-4 shadow-2xl xl:static xl:max-h-none xl:rounded-xl xl:border xl:p-5 xl:shadow-none"
                    }
                  >
                    <BlockEditor
                      key={editing.block.id}
                      initial={editing.block}
                      isNew={editing.isNew}
                      blocks={blocks}
                      palette={[...palette.values()]}
                      onClose={() => setEditing(null)}
                      onDelete={
                        editing.isNew
                          ? undefined
                          : () => {
                              onBlocksChange(deleteBlock(blocks, editing.block.id));
                              setEditing(null);
                            }
                      }
                      onSave={(block, renameAll) => {
                        let next = upsertBlock(blocks, block);
                        if (renameAll) next = renameMatching(upsertBlock(blocks, { ...block, title: editing.block.title }), block.id, block.title);
                        onBlocksChange(next);
                        setEditing(null);
                      }}
                    />
                  </div>
                </>
              )}

              <Card title="Activities" description="Click one, then a time in the calendar, to add another session. Or drag it onto the calendar.">
                <ul className="-mx-2 flex flex-col gap-1">
                  {summary.targets.map((s) => {
                    const onTarget = Math.abs(s.scheduledMinutes - s.targetMinutes) <= 30;
                    const item = palette.get(`a:${s.activityId}`);
                    return (
                      <li key={s.activityId}>
                        {listRow(
                          item,
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2 font-medium">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.name}
                              </span>
                              <span className={onTarget ? "text-zinc-600" : "font-medium text-amber-700"}>
                                {formatHours(s.scheduledMinutes)} / {formatHours(s.targetMinutes)}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(100, (s.scheduledMinutes / s.targetMinutes) * 100)}%`, backgroundColor: s.color }}
                              />
                            </div>
                            <p className="mt-0.5 flex justify-between text-xs text-zinc-400">
                              <span>
                                {s.sessions} session{s.sessions === 1 ? "" : "s"}
                              </span>
                              {item && <span className="opacity-0 transition group-hover:opacity-100">+ add {formatHours(item.minutes)}</span>}
                            </p>
                          </>,
                        )}
                      </li>
                    );
                  })}
                </ul>
                {summary.extras.length > 0 && (
                  <>
                    <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Added by you</h3>
                    <ul className="-mx-2 flex flex-col gap-1">
                      {summary.extras.map((x) => {
                        const item = palette.get(`t:${x.title}`);
                        return (
                          <li key={x.title}>
                            {listRow(
                              item,
                              <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: x.color }} />
                                  {x.title}
                                </span>
                                <span className="text-zinc-600">
                                  <span className="mr-2 text-xs text-zinc-400 opacity-0 transition group-hover:opacity-100">+ add {item && formatHours(item.minutes)}</span>
                                  {formatHours(x.minutes)} · {x.sessions}×
                                </span>
                              </div>,
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ExportButton({ blocks }: { blocks: WeekBlock[] }) {
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<"this" | "next">("next");
  const [repeat, setRepeat] = useState(1);
  const [includeFixed, setIncludeFixed] = useState(false);
  const thisMonday = mondayOf(new Date());
  const nextMonday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 7);
  const weekStart = week === "next" ? nextMonday : thisMonday;

  function download() {
    const events = blocks
      .filter((b) => b.kind === "activity" || (includeFixed && (b.kind === "event" || b.kind === "free")))
      .map((b) => ({ uid: b.id, title: b.title, day: b.day, start: b.start, end: b.end }));
    const ics = buildIcs(events, { weekStart, repeatWeeks: repeat });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-plan-${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}.ics`;
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
                <option value="next">Next week (from {fmt(nextMonday)})</option>
              </select>
            </Field>
            <Field label="Repeat">
              <select className={inputClass} value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
                <option value={1}>Just this week</option>
                <option value={4}>4 weeks</option>
                <option value={12}>12 weeks</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" className="h-4 w-4 accent-zinc-900" checked={includeFixed} onChange={(e) => setIncludeFixed(e.target.checked)} />
              Also export fixed events and free time
            </label>
            <p className="text-xs text-zinc-500">Import into Google Calendar (Settings → Import) or open with Apple Calendar.</p>
            <Button onClick={download}>Download</Button>
          </div>
        </div>
      )}
    </div>
  );
}
