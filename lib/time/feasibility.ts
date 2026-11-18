import { Activity, HOURS_TOLERANCE_MINUTES, STEP_MINUTES } from "../types";
import { hoursToMinutes } from "./clock";

export interface SessionPlan {
  /** Session lengths in minutes; empty when infeasible. */
  lengths: number[];
  problem?: string;
}

/**
 * Split an activity's weekly hours into sessions that respect min/max session
 * length and land within the ±30 min tolerance. Uses as few sessions as
 * possible, then spreads the time evenly in 15-minute steps.
 */
export function planSessions(activity: Pick<Activity, "name" | "hoursPerWeek" | "minSessionHours" | "maxSessionHours">): SessionPlan {
  const total = hoursToMinutes(activity.hoursPerWeek);
  const min = hoursToMinutes(activity.minSessionHours);
  const max = hoursToMinutes(activity.maxSessionHours);
  if (total <= 0) return { lengths: [], problem: `"${activity.name}": weekly hours must be greater than 0` };
  if (min <= 0 || max <= 0) return { lengths: [], problem: `"${activity.name}": session lengths must be greater than 0` };
  if (min > max) return { lengths: [], problem: `"${activity.name}": minimum session is longer than maximum` };
  if (min % STEP_MINUTES || max % STEP_MINUTES) {
    return { lengths: [], problem: `"${activity.name}": session lengths must be multiples of 15 minutes` };
  }

  const n = Math.max(1, Math.ceil(total / max));
  // n sessions of at least `min` each must not overshoot the tolerance.
  if (n * min > total + HOURS_TOLERANCE_MINUTES) {
    return {
      lengths: [],
      problem: `"${activity.name}": ${activity.hoursPerWeek}h can't be split into sessions of ${activity.minSessionHours}–${activity.maxSessionHours}h. Change the weekly hours or session length.`,
    };
  }

  const steps = Math.round(total / STEP_MINUTES);
  const base = Math.floor(steps / n);
  const extra = steps - base * n;
  const lengths = Array.from({ length: n }, (_, i) => Math.min(max, Math.max(min, (base + (i < extra ? 1 : 0)) * STEP_MINUTES)));
  return { lengths };
}
