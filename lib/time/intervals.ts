import { Day, Interval, MINUTES_PER_DAY, MINUTES_PER_WEEK } from "../types";

/** Sort and merge overlapping or touching intervals. */
export function mergeIntervals<T extends Interval>(intervals: T[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

/** base minus every interval in `remove`. Both inputs may be unsorted. */
export function subtractIntervals(base: Interval[], remove: Interval[]): Interval[] {
  const holes = mergeIntervals(remove);
  const out: Interval[] = [];
  for (const b of mergeIntervals(base)) {
    let cursor = b.start;
    for (const h of holes) {
      if (h.end <= cursor || h.start >= b.end) continue;
      if (h.start > cursor) out.push({ start: cursor, end: h.start });
      cursor = Math.max(cursor, h.end);
      if (cursor >= b.end) break;
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end });
  }
  return out;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function overlapMinutes(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

export function totalMinutes(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/**
 * Normalise an interval that may run past the end of the week (or start
 * before 0) into one or two intervals inside [0, MINUTES_PER_WEEK).
 */
export function wrapWeek<T extends Interval>(interval: T): T[] {
  const len = interval.end - interval.start;
  if (len <= 0) return [];
  if (len >= MINUTES_PER_WEEK) return [{ ...interval, start: 0, end: MINUTES_PER_WEEK }];
  const start = ((interval.start % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  const end = start + len;
  if (end <= MINUTES_PER_WEEK) return [{ ...interval, start, end }];
  return [
    { ...interval, start, end: MINUTES_PER_WEEK },
    { ...interval, start: 0, end: end - MINUTES_PER_WEEK },
  ];
}

/** Split week intervals at midnight → per-day pieces (minutes of day). */
export function splitByDay(intervals: Interval[]): { day: Day; start: number; end: number }[] {
  const out: { day: Day; start: number; end: number }[] = [];
  for (const i of intervals) {
    let s = i.start;
    while (s < i.end) {
      const day = Math.floor(s / MINUTES_PER_DAY);
      const dayEnd = (day + 1) * MINUTES_PER_DAY;
      const e = Math.min(i.end, dayEnd);
      out.push({ day: day as Day, start: s - day * MINUTES_PER_DAY, end: e - day * MINUTES_PER_DAY });
      s = e;
    }
  }
  return out;
}
