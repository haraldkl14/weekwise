"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Day, DAY_LONG, DAY_SHORT, DAYS, LockedInterval, Placement } from "@/lib/types";
import { DaySlot, formatHHMM, splitByDay } from "@/lib/time";
import { movePlacement } from "@/lib/schedule/move";

const PX_PER_MIN = 44 / 60; // 44px per hour
const DAY_HEIGHT = 1440 * PX_PER_MIN;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const LOCKED_STYLE: Record<LockedInterval["kind"], string> = {
  sleep: "bg-zinc-200/80 text-zinc-500",
  event: "bg-zinc-400/80 text-white",
  free: "bg-zinc-300/80 text-zinc-700 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,.35)_6px,rgba(255,255,255,.35)_12px)]",
};

interface LockedPiece {
  key: string;
  day: Day;
  start: number;
  end: number;
  kind: LockedInterval["kind"];
  label: string;
}

interface DragState {
  id: string;
  len: number;
  /** Minutes between the block's top and the pointer when the drag started. */
  grabOffset: number;
}

interface Preview {
  day: Day;
  start: number;
  end: number;
  ok: boolean;
}

export interface WeekCalendarProps {
  locked: LockedInterval[];
  placements?: Placement[];
  activities?: Activity[];
  /** Free slots; required for drag & drop. */
  slots?: DaySlot[];
  onPlacementsChange?: (next: Placement[]) => void;
  onReject?: (reason: string) => void;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

export function WeekCalendar(props: WeekCalendarProps) {
  const { locked, placements = [], activities = [] } = props;
  const [mobileDay, setMobileDay] = useState<Day>(() => (((new Date().getDay() + 6) % 7) as Day));
  const [preview, setPreview] = useState<Preview | null>(null);
  const drag = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);

  const pieces = useMemo<LockedPiece[]>(
    () =>
      locked.flatMap((l, i) =>
        splitByDay([l]).map((p, j) => ({ key: `${l.sourceId}-${i}-${j}`, day: p.day, start: p.start, end: p.end, kind: l.kind, label: l.label })),
      ),
    [locked],
  );
  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const draggable = Boolean(props.slots && props.onPlacementsChange);

  // Start scrolled to 06:00.
  useEffect(() => {
    for (const el of scrollRefs.current) if (el) el.scrollTop = 6 * 60 * PX_PER_MIN - 8;
  }, []);

  function minuteAt(e: React.DragEvent, column: HTMLElement): number {
    const rect = column.getBoundingClientRect();
    return (e.clientY - rect.top) / PX_PER_MIN - (drag.current?.grabOffset ?? 0);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, day: Day) {
    if (!drag.current || !props.slots) return;
    e.preventDefault();
    const res = movePlacement(placements, drag.current.id, day, minuteAt(e, e.currentTarget), props.slots);
    const moved = res.ok ? res.placements.find((p) => p.id === drag.current!.id)! : null;
    const start = moved ? moved.start : Math.max(0, Math.min(1440 - drag.current.len, Math.round(minuteAt(e, e.currentTarget) / 15) * 15));
    // Always "move": with "none" the browser skips the drop event and we could not explain the rejection.
    e.dataTransfer.dropEffect = "move";
    if (!preview || preview.day !== day || preview.start !== start || preview.ok !== res.ok) {
      setPreview({ day, start, end: start + drag.current.len, ok: res.ok });
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, day: Day) {
    e.preventDefault();
    const d = drag.current;
    drag.current = null;
    setDraggingId(null);
    setPreview(null);
    if (!d || !props.slots || !props.onPlacementsChange) return;
    const res = movePlacement(placements, d.id, day, minuteAt(e, e.currentTarget), props.slots);
    if (res.ok) props.onPlacementsChange(res.placements);
    else props.onReject?.(res.reason);
  }

  function renderColumn(day: Day) {
    return (
      <div
        className="relative border-l border-zinc-200"
        style={{ height: DAY_HEIGHT }}
        onDragOver={draggable ? (e) => handleDragOver(e, day) : undefined}
        onDragLeave={draggable ? () => setPreview(null) : undefined}
        onDrop={draggable ? (e) => handleDrop(e, day) : undefined}
      >
        {HOURS.map((h) => (
          <div key={h} className="absolute inset-x-0 border-t border-zinc-100" style={{ top: h * 60 * PX_PER_MIN }}>
            <div className="border-t border-dashed border-zinc-50" style={{ marginTop: 30 * PX_PER_MIN - 1 }} />
          </div>
        ))}

        {pieces
          .filter((p) => p.day === day)
          .map((p) => (
            <div
              key={p.key}
              title={`${p.label} ${formatHHMM(p.start)}–${formatHHMM(p.end)} (locked)`}
              className={`pointer-events-none absolute inset-x-0.5 overflow-hidden rounded px-1.5 py-0.5 text-[11px] leading-tight ${LOCKED_STYLE[p.kind]}`}
              style={{ top: p.start * PX_PER_MIN, height: Math.max(2, (p.end - p.start) * PX_PER_MIN - 1) }}
            >
              {p.end - p.start >= 30 && <span className="font-medium">{p.label}</span>}
            </div>
          ))}

        {placements
          .filter((p) => p.day === day)
          .map((p) => {
            const a = activityById.get(p.activityId);
            const short = p.end - p.start < 45;
            const dragging = draggingId === p.id;
            return (
              <button
                type="button"
                key={p.id}
                draggable={draggable}
                onDragStart={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  drag.current = { id: p.id, len: p.end - p.start, grabOffset: (e.clientY - rect.top) / PX_PER_MIN };
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", p.id);
                  setDraggingId(p.id);
                }}
                onDragEnd={() => {
                  drag.current = null;
                  setDraggingId(null);
                  setPreview(null);
                }}
                onClick={() => props.onSelect?.(p.id)}
                title={`${a?.name ?? "?"} ${formatHHMM(p.start)}–${formatHHMM(p.end)}${draggable ? " — drag to move" : ""}`}
                className={`absolute inset-x-1 z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight text-white shadow-sm ring-offset-1 transition ${
                  draggable ? "cursor-grab active:cursor-grabbing" : ""
                } ${props.selectedId === p.id ? "ring-2 ring-zinc-900" : ""} ${dragging ? "opacity-40" : ""}`}
                style={{ top: p.start * PX_PER_MIN, height: (p.end - p.start) * PX_PER_MIN - 1, backgroundColor: a?.color ?? "#71717a" }}
              >
                <span className="font-semibold">{a?.name ?? "Unknown"}</span>
                {!short && (
                  <span className="block opacity-90">
                    {formatHHMM(p.start)}–{formatHHMM(p.end)}
                  </span>
                )}
              </button>
            );
          })}

        {preview && preview.day === day && (
          <div
            className={`pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-dashed ${
              preview.ok ? "border-emerald-500 bg-emerald-500/15" : "border-red-500 bg-red-500/15"
            }`}
            style={{ top: preview.start * PX_PER_MIN, height: (preview.end - preview.start) * PX_PER_MIN }}
          >
            <span className={`ml-1 text-[11px] font-medium ${preview.ok ? "text-emerald-700" : "text-red-700"}`}>
              {formatHHMM(preview.start)} {preview.ok ? "" : "– blocked"}
            </span>
          </div>
        )}
      </div>
    );
  }

  const gutter = (
    <div className="relative" style={{ height: DAY_HEIGHT }}>
      {HOURS.map((h) => (
        <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-zinc-400" style={{ top: h * 60 * PX_PER_MIN }}>
          {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
        </div>
      ))}
    </div>
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      {/* Desktop / tablet: full week grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-zinc-200 text-center text-xs font-medium text-zinc-600">
          <div />
          {DAYS.map((d) => (
            <div key={d} className="py-2">
              {DAY_SHORT[d]}
            </div>
          ))}
        </div>
        <div ref={(el) => void (scrollRefs.current[0] = el)} className="max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
            {gutter}
            {DAYS.map((d) => (
              <div key={d}>{renderColumn(d)}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: one day at a time */}
      <div className="md:hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 p-2" role="tablist">
          {DAYS.map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={mobileDay === d}
              onClick={() => setMobileDay(d)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${mobileDay === d ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {DAY_SHORT[d]}
            </button>
          ))}
        </div>
        <p className="px-3 pt-2 text-sm font-medium text-zinc-700">{DAY_LONG[mobileDay]}</p>
        <div ref={(el) => void (scrollRefs.current[1] = el)} className="max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-[3rem_1fr]">
            {gutter}
            {renderColumn(mobileDay)}
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500">
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-zinc-200" /> Sleep
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-zinc-400" /> Fixed event
      </span>
      <span className="flex items-center gap-1">
        <span className={`h-3 w-3 rounded-sm ${LOCKED_STYLE.free}`} /> Protected free time
      </span>
    </div>
  );
}
