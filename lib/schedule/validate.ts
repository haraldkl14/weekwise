import { Activity, DAY_SHORT, HOURS_TOLERANCE_MINUTES, Placement, STEP_MINUTES } from "../types";
import { DaySlot, formatHHMM, formatHours, hoursToMinutes } from "../time";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const describe = (p: Placement, name: string) =>
  `"${name}" on ${DAY_SHORT[p.day] ?? `day ${p.day}`} ${safeTime(p.start)}–${safeTime(p.end)}`;

function safeTime(m: number): string {
  try {
    return formatHHMM(m);
  } catch {
    return String(m);
  }
}

/** Errors for individual sessions that don't depend on weekly totals. */
export function placementErrors(p: Placement, activity: Activity | undefined, slots: DaySlot[]): string[] {
  if (!activity) return [`Unknown activity id "${p.activityId}"`];
  const errors: string[] = [];
  const label = describe(p, activity.name);
  if (!Number.isInteger(p.day) || p.day < 0 || p.day > 6) return [`${label}: invalid day`];
  if (!(p.end > p.start) || p.start < 0 || p.end > 1440) return [`${label}: start must be before end on the same day`];
  if (p.start % STEP_MINUTES || p.end % STEP_MINUTES) errors.push(`${label}: times must be on 15-minute boundaries`);
  const len = p.end - p.start;
  const min = hoursToMinutes(activity.minSessionHours);
  const max = hoursToMinutes(activity.maxSessionHours);
  if (len < min || len > max) {
    errors.push(`${label}: session is ${formatHours(len)}, must be between ${formatHours(min)} and ${formatHours(max)}`);
  }
  const fits = slots.some((s) => s.day === p.day && s.start <= p.start && p.end <= s.end);
  if (!fits) errors.push(`${label}: overlaps a locked block (sleep, fixed event + buffer, or free time)`);
  return errors;
}

/**
 * Validates a full set of placements against available slots and activity
 * constraints. Messages are written to be fed back to the model verbatim.
 */
export function validateSchedule(placements: Placement[], activities: Activity[], slots: DaySlot[]): ValidationResult {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const errors: string[] = [];

  for (const p of placements) errors.push(...placementErrors(p, byId.get(p.activityId), slots));

  // Overlaps between sessions (any activity).
  const sorted = [...placements].sort((a, b) => a.day - b.day || a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].day === sorted[i].day && sorted[j].start < sorted[i].end; j++) {
      const a = sorted[i];
      const b = sorted[j];
      errors.push(
        `${describe(a, byId.get(a.activityId)?.name ?? a.activityId)} overlaps ${describe(b, byId.get(b.activityId)?.name ?? b.activityId)}`,
      );
    }
  }

  // Weekly totals.
  for (const a of activities) {
    const scheduled = placements.filter((p) => p.activityId === a.id).reduce((s, p) => s + Math.max(0, p.end - p.start), 0);
    const target = hoursToMinutes(a.hoursPerWeek);
    if (Math.abs(scheduled - target) > HOURS_TOLERANCE_MINUTES) {
      errors.push(`"${a.name}" (id ${a.id}) has ${formatHours(scheduled)} scheduled, target is ${formatHours(target)} (±0.5h)`);
    }
  }

  return { valid: errors.length === 0, errors };
}
