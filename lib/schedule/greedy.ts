import { Activity, Day, DAYS, Placement, TIME_OF_DAY_RANGES } from "../types";
import { DaySlot, formatHours, planSessions } from "../time";

export interface GreedyResult {
  placements: Placement[];
  warnings: string[];
  explanation: string;
}

interface Candidate {
  day: Day;
  start: number;
  /** Minutes of the session inside the preferred window. */
  inPref: number;
  score: number;
}

function preferredRange(a: Activity): [number, number] | null {
  return a.timeOfDay === "any" ? null : TIME_OF_DAY_RANGES[a.timeOfDay];
}

function bestStartInDay(free: DaySlot[], day: Day, len: number, pref: [number, number] | null): Candidate | null {
  let best: Candidate | null = null;
  for (const slot of free) {
    if (slot.day !== day || slot.end - slot.start < len) continue;
    const starts = new Set([slot.start, slot.end - len]);
    if (pref) {
      starts.add(Math.min(Math.max(pref[0], slot.start), slot.end - len));
      starts.add(Math.min(Math.max(pref[1] - len, slot.start), slot.end - len));
    }
    for (const start of starts) {
      // Score: minutes inside the preferred window (higher is better); otherwise prefer earlier.
      const inPref = pref ? Math.max(0, Math.min(start + len, pref[1]) - Math.max(start, pref[0])) : 0;
      const score = inPref * 10000 - start;
      if (!best || score > best.score) best = { day, start, inPref, score };
    }
  }
  return best;
}

function reserve(free: DaySlot[], day: Day, start: number, end: number): DaySlot[] {
  return free.flatMap((s) => {
    if (s.day !== day || end <= s.start || start >= s.end) return [s];
    const out: DaySlot[] = [];
    if (start > s.start) out.push({ day, start: s.start, end: start });
    if (end < s.end) out.push({ day, start: end, end: s.end });
    return out;
  });
}

/**
 * Deterministic fallback. Most constrained activities go first; each
 * activity's sessions are spread over different days and placed in the
 * preferred time of day where possible.
 */
export function greedySchedule(activities: Activity[], slots: DaySlot[]): GreedyResult {
  let free = slots.map((s) => ({ ...s }));
  const placements: Placement[] = [];
  const warnings: string[] = [];

  const ordered = [...activities].sort(
    (a, b) =>
      b.minSessionHours - a.minSessionHours ||
      Number(b.timeOfDay !== "any") - Number(a.timeOfDay !== "any") ||
      b.hoursPerWeek - a.hoursPerWeek ||
      a.name.localeCompare(b.name),
  );

  for (const activity of ordered) {
    const plan = planSessions(activity);
    if (plan.problem) {
      warnings.push(plan.problem);
      continue;
    }
    const pref = preferredRange(activity);
    const perDay = new Map<Day, number>();
    let placedMinutes = 0;

    for (const len of [...plan.lengths].sort((a, b) => b - a)) {
      const dayOrder = [...DAYS].sort((a, b) => {
        const load = (d: Day) => (perDay.get(d) ?? 0) * 10 + ((perDay.get(((d + 6) % 7) as Day) ?? 0) + (perDay.get(((d + 1) % 7) as Day) ?? 0));
        return load(a) - load(b) || a - b;
      });
      // Take the least-loaded day that fully honours the time-of-day preference;
      // otherwise the day that honours it best.
      let chosen: Candidate | null = null;
      let fallback: Candidate | null = null;
      for (const day of dayOrder) {
        const c = bestStartInDay(free, day, len, pref);
        if (!c) continue;
        if (!pref || c.inPref === len) {
          chosen = c;
          break;
        }
        if (!fallback || c.inPref > fallback.inPref) fallback = c;
      }
      chosen ??= fallback;
      if (!chosen) continue;
      placements.push({
        id: `${activity.id}-${placements.length}`,
        activityId: activity.id,
        day: chosen.day,
        start: chosen.start,
        end: chosen.start + len,
      });
      free = reserve(free, chosen.day, chosen.start, chosen.start + len);
      perDay.set(chosen.day, (perDay.get(chosen.day) ?? 0) + 1);
      placedMinutes += len;
    }

    const target = Math.round(activity.hoursPerWeek * 60);
    if (placedMinutes < target - 30) {
      warnings.push(
        `Only ${formatHours(placedMinutes)} of ${formatHours(target)} for "${activity.name}" fit: the free gaps are too short for ${activity.minSessionHours}h+ sessions.`,
      );
    }
  }

  placements.sort((a, b) => a.day - b.day || a.start - b.start);
  return {
    placements,
    warnings,
    explanation:
      "Scheduled with the deterministic planner: the most constrained activities were placed first, sessions were spread across different days, and each was put in its preferred time of day where a free gap allowed it. Free-text notes are not taken into account by this planner.",
  };
}
