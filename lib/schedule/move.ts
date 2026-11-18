import { Day, Placement, STEP_MINUTES } from "../types";
import { DaySlot } from "../time";

export type MoveResult = { ok: true; placements: Placement[] } | { ok: false; reason: string };

/** Move a session to a new day/start, keeping its length. Rejects locked time and collisions. */
export function movePlacement(placements: Placement[], id: string, day: Day, start: number, slots: DaySlot[]): MoveResult {
  const target = placements.find((p) => p.id === id);
  if (!target) return { ok: false, reason: "Session not found." };
  const len = target.end - target.start;
  const snapped = Math.round(start / STEP_MINUTES) * STEP_MINUTES;
  const s = Math.max(0, Math.min(snapped, 1440 - len));
  const e = s + len;

  if (!slots.some((slot) => slot.day === day && slot.start <= s && e <= slot.end)) {
    return { ok: false, reason: "That time overlaps a locked block (sleep, a fixed event and its buffer, or free time)." };
  }
  const clash = placements.find((p) => p.id !== id && p.day === day && p.start < e && s < p.end);
  if (clash) return { ok: false, reason: "That time overlaps another session." };

  return { ok: true, placements: placements.map((p) => (p.id === id ? { ...p, day, start: s, end: e } : p)) };
}
