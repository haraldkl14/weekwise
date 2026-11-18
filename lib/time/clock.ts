import { Day, MINUTES_PER_DAY, MINUTES_PER_WEEK } from "../types";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHHMM(value: string): boolean {
  return HHMM_RE.test(value);
}

/** "08:30" → 510. Throws on malformed input. */
export function parseHHMM(value: string): number {
  const m = HHMM_RE.exec(value);
  if (!m) throw new Error(`Invalid time "${value}", expected HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 510 → "08:30". 1440 → "24:00" (end of day). */
export function formatHHMM(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) {
    throw new Error(`Minutes out of range: ${minutes}`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function weekMinute(day: Day, minuteOfDay: number): number {
  return day * MINUTES_PER_DAY + minuteOfDay;
}

export function dayOf(weekMin: number): Day {
  const wrapped = ((weekMin % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  return Math.floor(wrapped / MINUTES_PER_DAY) as Day;
}

export function nextDay(day: Day): Day {
  return ((day + 1) % 7) as Day;
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/** 90 → "1.5h", 135 → "2.25h". */
export function formatHours(minutes: number): string {
  return `${Number((minutes / 60).toFixed(2))}h`;
}
