/**
 * The editable week shown after generation. Once a schedule exists, every
 * block (sleep, fixed events, free time, activities) is a plain WeekBlock the
 * user can move, resize, rename, delete or add, overlaps included. The
 * generator's rules apply only to generation, not to manual edits.
 */
import { Activity, Day, FixedCommitments, LockedInterval, Placement, STEP_MINUTES } from "../types";
import { lockedIntervals, splitByDay } from "../time";

export type BlockKind = "sleep" | "event" | "free" | "activity";

export interface WeekBlock {
  id: string;
  kind: BlockKind;
  title: string;
  /** Activity color; null for fixed blocks (drawn gray). */
  color: string | null;
  day: Day;
  /** Minutes from midnight; end may be 1440. */
  start: number;
  end: number;
  /** Set when the block counts toward a Step 2 activity's weekly target. */
  activityId?: string;
}

export const MIN_BLOCK_MINUTES = STEP_MINUTES;
const DAY_END = 1440;

export const snap = (m: number) => Math.round(m / STEP_MINUTES) * STEP_MINUTES;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Fixed commitments as per-day blocks (no buffers). */
export function lockedToBlocks(locked: LockedInterval[]): WeekBlock[] {
  return locked.flatMap((l) =>
    splitByDay([l]).map((p) => ({
      id: `${l.kind}-${l.sourceId}-${p.day}-${p.start}`,
      kind: l.kind,
      title: l.label,
      color: null,
      day: p.day,
      start: p.start,
      end: p.end,
    })),
  );
}

export function placementsToBlocks(placements: Placement[], activities: Activity[]): WeekBlock[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  return placements.map((p) => {
    const a = byId.get(p.activityId);
    return {
      id: `act-${p.id}`,
      kind: "activity" as const,
      title: a?.name ?? "Activity",
      color: a?.color ?? "#71717a",
      day: p.day,
      start: p.start,
      end: p.end,
      activityId: p.activityId,
    };
  });
}

export function buildWeek(fixed: FixedCommitments, activities: Activity[], placements: Placement[]): WeekBlock[] {
  return sortBlocks([...lockedToBlocks(lockedIntervals(fixed)), ...placementsToBlocks(placements, activities)]);
}

export function sortBlocks(blocks: WeekBlock[]): WeekBlock[] {
  return [...blocks].sort((a, b) => a.day - b.day || a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
}

/** Move a block to a day/start, keeping its length; snaps to 15 min and stays inside the day. Overlaps are allowed. */
export function moveBlock(blocks: WeekBlock[], id: string, day: Day, start: number): WeekBlock[] {
  return blocks.map((b) => {
    if (b.id !== id) return b;
    const len = b.end - b.start;
    const s = clamp(snap(start), 0, DAY_END - len);
    return { ...b, day, start: s, end: s + len };
  });
}

/** Drag one edge of a block. Keeps at least 15 minutes and stays inside the day. */
export function resizeBlock(blocks: WeekBlock[], id: string, edge: "start" | "end", minute: number): WeekBlock[] {
  return blocks.map((b) => {
    if (b.id !== id) return b;
    if (edge === "end") return { ...b, end: clamp(snap(minute), b.start + MIN_BLOCK_MINUTES, DAY_END) };
    return { ...b, start: clamp(snap(minute), 0, b.end - MIN_BLOCK_MINUTES) };
  });
}

/** Problems with a block's times, or null when it's fine. Used by the edit form. */
export function timeError(start: number, end: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Set a start and end time.";
  if (start < 0 || end > DAY_END) return "Times must be within the day.";
  if (end <= start) return "The end must be after the start (blocks can't cross midnight).";
  if (end - start < MIN_BLOCK_MINUTES) return "Blocks must be at least 15 minutes long.";
  return null;
}

export function upsertBlock(blocks: WeekBlock[], block: WeekBlock): WeekBlock[] {
  const exists = blocks.some((b) => b.id === block.id);
  return sortBlocks(exists ? blocks.map((b) => (b.id === block.id ? block : b)) : [...blocks, block]);
}

export function deleteBlock(blocks: WeekBlock[], id: string): WeekBlock[] {
  return blocks.filter((b) => b.id !== id);
}

/** Blocks sharing a title and kind with the given block (including itself). */
export function sameTitleBlocks(blocks: WeekBlock[], id: string): WeekBlock[] {
  const target = blocks.find((b) => b.id === id);
  if (!target) return [];
  return blocks.filter((b) => b.kind === target.kind && b.title === target.title);
}

/** Rename every block with the same title and kind as `id`. */
export function renameMatching(blocks: WeekBlock[], id: string, title: string): WeekBlock[] {
  const ids = new Set(sameTitleBlocks(blocks, id).map((b) => b.id));
  return blocks.map((b) => (ids.has(b.id) ? { ...b, title } : b));
}

/** The empty stretch of the day around `minute`, or null if a block covers it. */
export function gapAt(blocks: WeekBlock[], day: Day, minute: number): { start: number; end: number } | null {
  const dayBlocks = blocks.filter((b) => b.day === day);
  if (dayBlocks.some((b) => b.start <= minute && minute < b.end)) return null;
  const start = Math.max(0, ...dayBlocks.filter((b) => b.end <= minute).map((b) => b.end));
  const end = Math.min(DAY_END, ...dayBlocks.filter((b) => b.start > minute).map((b) => b.start));
  return { start, end };
}

/** Default range for a block added at `minute`: starts on the half hour, lasts 1h, cut short by the next block. */
export function newBlockRange(blocks: WeekBlock[], day: Day, minute: number): { start: number; end: number } {
  const gap = gapAt(blocks, day, minute) ?? { start: 0, end: DAY_END };
  const start = clamp(Math.floor(minute / 30) * 30, gap.start, Math.max(gap.start, gap.end - MIN_BLOCK_MINUTES));
  const end = Math.min(start + 60, gap.end);
  return end - start >= MIN_BLOCK_MINUTES ? { start, end } : { start, end: Math.min(DAY_END, start + MIN_BLOCK_MINUTES) };
}

export function overlapping(blocks: WeekBlock[], block: Pick<WeekBlock, "id" | "day" | "start" | "end">): WeekBlock[] {
  return blocks.filter((b) => b.id !== block.id && b.day === block.day && b.start < block.end && block.start < b.end);
}

/**
 * Side-by-side layout for overlapping blocks within one day, like a calendar
 * app: each cluster of overlapping blocks is split into columns.
 */
export function layoutDay(blocks: WeekBlock[]): Map<string, { col: number; cols: number }> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: { id: string; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { col: c.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= b.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(b.end);
    } else colEnds[col] = b.end;
    cluster.push({ id: b.id, col });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

export interface BlockSummary {
  /** Step 2 activities with their weekly target. */
  targets: { activityId: string; name: string; color: string; scheduledMinutes: number; targetMinutes: number; sessions: number }[];
  /** Activity blocks not linked to a Step 2 activity, grouped by title. */
  extras: { title: string; color: string; minutes: number; sessions: number }[];
}

export function summarizeBlocks(blocks: WeekBlock[], activities: Activity[]): BlockSummary {
  const known = new Set(activities.map((a) => a.id));
  const acts = blocks.filter((b) => b.kind === "activity");
  const targets = activities.map((a) => {
    const mine = acts.filter((b) => b.activityId === a.id);
    return {
      activityId: a.id,
      name: a.name,
      color: a.color,
      scheduledMinutes: mine.reduce((s, b) => s + b.end - b.start, 0),
      targetMinutes: Math.round(a.hoursPerWeek * 60),
      sessions: mine.length,
    };
  });
  const extras = new Map<string, BlockSummary["extras"][number]>();
  for (const b of acts.filter((x) => !x.activityId || !known.has(x.activityId))) {
    const e = extras.get(b.title) ?? { title: b.title, color: b.color ?? "#71717a", minutes: 0, sessions: 0 };
    e.minutes += b.end - b.start;
    e.sessions += 1;
    extras.set(b.title, e);
  }
  return { targets, extras: [...extras.values()] };
}

/** An activity you can place again from the side list: same name, color and length. */
export interface PaletteItem {
  key: string;
  title: string;
  color: string;
  /** Length of a new block placed from this item. */
  minutes: number;
  activityId?: string;
}

/** Most common block length; ties go to the longer one. */
export function typicalLength(blocks: Pick<WeekBlock, "start" | "end">[]): number | null {
  const counts = new Map<number, number>();
  for (const b of blocks) counts.set(b.end - b.start, (counts.get(b.end - b.start) ?? 0) + 1);
  let best: number | null = null;
  for (const [len, n] of counts) if (best === null || n > counts.get(best)! || (n === counts.get(best)! && len > best)) best = len;
  return best;
}

export function paletteItems(blocks: WeekBlock[], activities: Activity[]): PaletteItem[] {
  const acts = blocks.filter((b) => b.kind === "activity");
  const known = new Set(activities.map((a) => a.id));
  const items: PaletteItem[] = activities.map((a) => ({
    key: `a:${a.id}`,
    title: a.name,
    color: a.color,
    minutes: typicalLength(acts.filter((b) => b.activityId === a.id)) ?? Math.round(a.minSessionHours * 60),
    activityId: a.id,
  }));
  const extras = new Map<string, WeekBlock[]>();
  for (const b of acts.filter((x) => !x.activityId || !known.has(x.activityId))) extras.set(b.title, [...(extras.get(b.title) ?? []), b]);
  for (const [title, group] of extras) {
    items.push({ key: `t:${title}`, title, color: group[group.length - 1].color ?? "#71717a", minutes: typicalLength(group)! });
  }
  return items;
}

/** Start minute for placing an item whose top edge is at `minute`: snapped, and fully inside the day. */
export function placementStart(minute: number, minutes: number): number {
  return clamp(Math.floor(minute / STEP_MINUTES) * STEP_MINUTES, 0, DAY_END - Math.min(minutes, DAY_END));
}

export function placeItem(blocks: WeekBlock[], item: PaletteItem, day: Day, minute: number, id: string): WeekBlock[] {
  const start = placementStart(minute, item.minutes);
  return upsertBlock(blocks, {
    id,
    kind: "activity",
    title: item.title,
    color: item.color,
    day,
    start,
    end: Math.min(DAY_END, start + item.minutes),
    ...(item.activityId ? { activityId: item.activityId } : {}),
  });
}
