import { Activity, Day, DAY_SHORT, Placement } from "../types";
import { isValidHHMM, parseHHMM } from "../time";
import type { RawPlacement } from "../ai/scheduler";

function parseTime(value: string): number | null {
  if (value === "24:00") return 1440;
  return isValidHHMM(value) ? parseHHMM(value) : null;
}

function parseDay(value: string): Day | null {
  const v = value.trim().slice(0, 3).toLowerCase();
  const i = DAY_SHORT.findIndex((d) => d.toLowerCase() === v);
  return i === -1 ? null : (i as Day);
}

/** Convert the model's string-based placements into typed ones. */
export function convertRawPlacements(raw: RawPlacement[], activities: Activity[]): { placements: Placement[]; errors: string[] } {
  const ids = new Set(activities.map((a) => a.id));
  const placements: Placement[] = [];
  const errors: string[] = [];
  raw.forEach((r, i) => {
    const day = parseDay(String(r.day ?? ""));
    const start = parseTime(String(r.start ?? ""));
    const end = parseTime(String(r.end ?? ""));
    if (!ids.has(r.activity)) errors.push(`Placement #${i + 1}: unknown activity id "${r.activity}"`);
    else if (day === null) errors.push(`Placement #${i + 1}: invalid day "${r.day}"`);
    else if (start === null || end === null) errors.push(`Placement #${i + 1}: invalid time "${r.start}"–"${r.end}"`);
    else placements.push({ id: `p${i}`, activityId: r.activity, day, start, end });
  });
  return { placements, errors };
}

export function placementsToRaw(placements: Placement[]): RawPlacement[] {
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return placements.map((p) => ({ activity: p.activityId, day: DAY_SHORT[p.day], start: fmt(p.start), end: fmt(p.end) }));
}
