import { Activity, Day, FixedCommitments, Interval, MINUTES_PER_WEEK, STEP_MINUTES } from "../types";
import { blockedIntervals } from "./commitments";
import { splitByDay, subtractIntervals, totalMinutes } from "./intervals";
import { hoursToMinutes } from "./clock";

export interface DaySlot {
  day: Day;
  start: number;
  end: number;
}

const ceilStep = (m: number) => Math.ceil(m / STEP_MINUTES) * STEP_MINUTES;
const floorStep = (m: number) => Math.floor(m / STEP_MINUTES) * STEP_MINUTES;

/**
 * Free time in the week after removing sleep, events (+buffer) and protected
 * free time. Split at midnight and snapped inward to 15-minute boundaries so
 * every slot can actually hold sessions. Slots shorter than `minLength` are dropped.
 */
export function availableSlots(fixed: FixedCommitments, minLength = STEP_MINUTES): DaySlot[] {
  const free = subtractIntervals([{ start: 0, end: MINUTES_PER_WEEK }], blockedIntervals(fixed));
  return splitByDay(free)
    .map((s) => ({ day: s.day, start: ceilStep(s.start), end: floorStep(s.end) }))
    .filter((s) => s.end - s.start >= minLength);
}

export function slotsToWeekIntervals(slots: DaySlot[]): Interval[] {
  return slots.map((s) => ({ start: s.day * 1440 + s.start, end: s.day * 1440 + s.end }));
}

export function availableMinutes(fixed: FixedCommitments): number {
  return totalMinutes(slotsToWeekIntervals(availableSlots(fixed)));
}

export function requestedMinutes(activities: Activity[]): number {
  return activities.reduce((sum, a) => sum + hoursToMinutes(a.hoursPerWeek), 0);
}

export interface Capacity {
  availableMinutes: number;
  requestedMinutes: number;
  /** > 0 when the user asked for more than fits. */
  overByMinutes: number;
  canGenerate: boolean;
}

export function capacity(fixed: FixedCommitments, activities: Activity[]): Capacity {
  const available = availableMinutes(fixed);
  const requested = requestedMinutes(activities);
  const over = Math.max(0, requested - available);
  return {
    availableMinutes: available,
    requestedMinutes: requested,
    overByMinutes: over,
    canGenerate: activities.length > 0 && over === 0,
  };
}
