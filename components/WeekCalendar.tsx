"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Day, DAY_LONG, DAY_SHORT, DAYS } from "@/lib/types";
import { formatHHMM } from "@/lib/time";
import { BlockKind, gapAt, layoutDay, moveBlock, newBlockRange, PaletteItem, placementStart, resizeBlock, WeekBlock } from "@/lib/schedule/week";

const PX_PER_MIN = 44 / 60; // 44px per hour
const DAY_HEIGHT = 1440 * PX_PER_MIN;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const EDGE_PX = 7; // grab zone for resizing
const DRAG_THRESHOLD_PX = 4;

const FIXED_STYLE: Record<Exclude<BlockKind, "activity">, string> = {
  sleep: "bg-zinc-200 text-zinc-500",
  event: "bg-zinc-400 text-white",
  free: "bg-zinc-300 text-zinc-700 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,.35)_6px,rgba(255,255,255,.35)_12px)]",
};

type DragMode = "move" | "start" | "end";

interface DragSession {
  id: string;
  mode: DragMode;
  originX: number;
  originY: number;
  orig: WeekBlock;
  moved: boolean;
}

export interface WeekCalendarProps {
  blocks: WeekBlock[];
  /** Enables drag, resize, click-to-edit and click-to-add. */
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChange?: (blocks: WeekBlock[]) => void;
  onAdd?: (day: Day, start: number, end: number) => void;
  /** An item from the side list being placed: the next click (or drop) puts a copy there. */
  placing?: PaletteItem | null;
  /** True while the item is being dragged from the list (place on pointer release). */
  placingByDrag?: boolean;
  onPlace?: (day: Day, minute: number) => void;
}

export function WeekCalendar({ blocks, editable = false, selectedId, onSelect, onChange, onAdd, placing, placingByDrag, onPlace }: WeekCalendarProps) {
  const [mobileDay, setMobileDay] = useState<Day>(() => (((new Date().getDay() + 6) % 7) as Day));
  /** Blocks as they look mid-drag; null when not dragging. */
  const [preview, setPreview] = useState<WeekBlock[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ day: Day; start: number; end: number } | null>(null);

  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);
  const columns = useRef(new Map<string, { day: Day; el: HTMLDivElement }>());
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);
  const blocksRef = useRef(blocks);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    blocksRef.current = blocks;
    onChangeRef.current = onChange;
  });

  const shown = preview ?? blocks;
  const byDay = useMemo(() => {
    const m = new Map<Day, { blocks: WeekBlock[]; layout: ReturnType<typeof layoutDay> }>();
    for (const d of DAYS) {
      const dayBlocks = shown.filter((b) => b.day === d);
      m.set(d, { blocks: dayBlocks, layout: layoutDay(dayBlocks) });
    }
    return m;
  }, [shown]);

  // Start scrolled to 06:00.
  useEffect(() => {
    for (const el of scrollRefs.current) if (el) el.scrollTop = 6 * 60 * PX_PER_MIN - 8;
  }, []);

  function dayUnder(clientX: number): Day | null {
    for (const { day, el } of columns.current.values()) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && clientX >= r.left && clientX < r.right) return day;
    }
    return null;
  }

  function apply(s: DragSession, clientX: number, clientY: number): WeekBlock[] {
    const delta = (clientY - s.originY) / PX_PER_MIN;
    const base = blocksRef.current;
    if (s.mode === "end") return resizeBlock(base, s.id, "end", s.orig.end + delta);
    if (s.mode === "start") return resizeBlock(base, s.id, "start", s.orig.start + delta);
    return moveBlock(base, s.id, dayUnder(clientX) ?? s.orig.day, s.orig.start + delta);
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>, block: WeekBlock) {
    // Touch keeps native scrolling; on touch devices blocks are edited by tapping.
    if (!editable || e.button !== 0 || e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mode: DragMode = rect.height > EDGE_PX * 3 && y < EDGE_PX ? "start" : y > rect.height - EDGE_PX ? "end" : "move";
    e.preventDefault();
    session.current = { id: block.id, mode, originX: e.clientX, originY: e.clientY, orig: block, moved: false };
    setHover(null);

    const onMove = (ev: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      if (!s.moved && Math.hypot(ev.clientX - s.originX, ev.clientY - s.originY) < DRAG_THRESHOLD_PX) return;
      s.moved = true;
      setDraggingId(s.id);
      setPreview(apply(s, ev.clientX, ev.clientY));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const s = session.current;
      session.current = null;
      setPreview(null);
      setDraggingId(null);
      if (s?.moved) {
        // The click event that follows this pointerup isn't a real click.
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
        onChangeRef.current?.(apply(s, ev.clientX, ev.clientY));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function minuteAt(clientY: number, el: HTMLElement) {
    return Math.max(0, Math.min(1439, (clientY - el.getBoundingClientRect().top) / PX_PER_MIN));
  }

  function renderColumn(day: Day, view: "desk" | "mob") {
    const { blocks: dayBlocks, layout } = byDay.get(day)!;
    return (
      <div
        ref={(el) => {
          const key = `${view}-${day}`;
          if (el) columns.current.set(key, { day, el });
          else columns.current.delete(key);
        }}
        className={`relative border-l border-zinc-200 ${placing ? "cursor-copy" : editable ? "cursor-cell" : ""}`}
        style={{ height: DAY_HEIGHT }}
        onPointerMove={
          editable
            ? (e) => {
                if (session.current || e.pointerType === "touch") return;
                const minute = minuteAt(e.clientY, e.currentTarget);
                if (placing) {
                  const start = placementStart(minute, placing.minutes);
                  if (!hover || hover.day !== day || hover.start !== start) setHover({ day, start, end: Math.min(1440, start + placing.minutes) });
                  return;
                }
                const range = gapAt(blocks, day, minute) ? newBlockRange(blocks, day, minute) : null;
                if (!range) return setHover(null);
                if (!hover || hover.day !== day || hover.start !== range.start) setHover({ day, ...range });
              }
            : undefined
        }
        onPointerLeave={editable ? () => setHover(null) : undefined}
        onPointerUp={
          editable && placing && placingByDrag
            ? (e) => {
                setHover(null);
                onPlace?.(day, minuteAt(e.clientY, e.currentTarget));
              }
            : undefined
        }
        onClick={
          editable
            ? (e) => {
                if (suppressClick.current) return void (suppressClick.current = false);
                const minute = minuteAt(e.clientY, e.currentTarget);
                if (placing) {
                  setHover(null);
                  if (!placingByDrag) onPlace?.(day, minute);
                  return;
                }
                if (!gapAt(blocks, day, minute)) return;
                const range = newBlockRange(blocks, day, minute);
                onAdd?.(day, range.start, range.end);
              }
            : undefined
        }
      >
        {HOURS.map((h) => (
          <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-zinc-100" style={{ top: h * 60 * PX_PER_MIN }}>
            <div className="border-t border-dashed border-zinc-50" style={{ marginTop: 30 * PX_PER_MIN - 1 }} />
          </div>
        ))}

        {hover && hover.day === day && placing && (
          <div
            className="pointer-events-none absolute inset-x-1 z-40 overflow-hidden rounded-md border-2 border-dashed border-white px-1.5 py-0.5 text-[11px] leading-tight text-white opacity-80 shadow-lg"
            style={{ top: hover.start * PX_PER_MIN, height: (hover.end - hover.start) * PX_PER_MIN - 1, backgroundColor: placing.color }}
          >
            <span className="font-semibold">{placing.title}</span>
            <span className="block">
              {formatHHMM(hover.start)}–{formatHHMM(hover.end)}
            </span>
          </div>
        )}

        {hover && hover.day === day && !placing && (
          <div
            className="pointer-events-none absolute inset-x-1 z-0 flex items-start rounded-md border border-dashed border-zinc-400 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500"
            style={{ top: hover.start * PX_PER_MIN, height: (hover.end - hover.start) * PX_PER_MIN - 1 }}
          >
            + Add activity
          </div>
        )}

        {dayBlocks.map((b) => {
          const { col, cols } = layout.get(b.id) ?? { col: 0, cols: 1 };
          const len = b.end - b.start;
          const isActivity = b.kind === "activity";
          const style = b.kind === "activity" ? "text-white shadow-sm" : FIXED_STYLE[b.kind];
          const interactive = editable;
          return (
            <div
              key={b.id}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={`${b.title} ${DAY_LONG[b.day]} ${formatHHMM(b.start)} to ${formatHHMM(b.end)}`}
              title={`${b.title} ${formatHHMM(b.start)}–${formatHHMM(b.end)}${interactive ? " · drag to move, drag the top/bottom edge to resize, click to edit" : ""}`}
              onPointerDown={interactive ? (e) => startDrag(e, b) : undefined}
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      if (suppressClick.current) return void (suppressClick.current = false);
                      onSelect?.(b.id);
                    }
                  : undefined
              }
              onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect?.(b.id)) : undefined}
              className={`group absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight ${style} ${
                interactive ? "cursor-grab select-none outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 active:cursor-grabbing" : "pointer-events-none"
              } ${placing ? "pointer-events-none" : ""} ${selectedId === b.id ? "ring-2 ring-zinc-900 ring-offset-1" : ""} ${draggingId === b.id ? "z-30 opacity-90 shadow-lg" : isActivity ? "z-20" : "z-10"}`}
              style={{
                top: b.start * PX_PER_MIN,
                height: Math.max(2, len * PX_PER_MIN - 1),
                left: `calc(${(col / cols) * 100}% + 2px)`,
                width: `calc(${100 / cols}% - 4px)`,
                backgroundColor: isActivity ? (b.color ?? "#71717a") : undefined,
              }}
            >
              {interactive && (
                <>
                  <span className="absolute inset-x-0 top-0 h-[7px] cursor-ns-resize" aria-hidden />
                  <span className="absolute inset-x-0 bottom-0 flex h-[7px] cursor-ns-resize justify-center" aria-hidden>
                    <span className="mt-[3px] hidden h-[2px] w-6 rounded bg-white/70 group-hover:block" />
                  </span>
                </>
              )}
              {len >= 30 && <span className={isActivity ? "font-semibold" : "font-medium"}>{b.title}</span>}
              {len >= 45 && (
                <span className="block opacity-90">
                  {formatHHMM(b.start)}–{formatHHMM(b.end)}
                </span>
              )}
            </div>
          );
        })}
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
              <div key={d}>{renderColumn(d, "desk")}</div>
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
            {renderColumn(mobileDay, "mob")}
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
        <span className={`h-3 w-3 rounded-sm ${FIXED_STYLE.free}`} /> Protected free time
      </span>
    </div>
  );
}
