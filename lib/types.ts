export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type HHMM = string;

export const DAYS: readonly Day[] = [0, 1, 2, 3, 4, 5, 6];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
/** Granularity of scheduled sessions. */
export const STEP_MINUTES = 15;
/** Allowed deviation from an activity's weekly target. */
export const HOURS_TOLERANCE_MINUTES = 30;

export interface TimeBlock {
  id: string;
  name: string;
  days: Day[];
  start: HHMM;
  /** If end <= start the block crosses midnight into the next day. */
  end: HHMM;
}

export interface SleepTimes {
  bedtime: HHMM;
  wake: HHMM;
}

export interface SleepSchedule {
  weekday: SleepTimes;
  weekend: SleepTimes;
  /** Weekend times apply to bedtimes on Fri/Sat and wake times on Sat/Sun. */
  splitWeekend: boolean;
}

export interface FixedCommitments {
  events: TimeBlock[];
  freeTime: TimeBlock[];
  sleep: SleepSchedule;
  /** Buffer kept free before and after recurring events. */
  bufferMinutes: number;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export const TIME_OF_DAY_RANGES: Record<Exclude<TimeOfDay, "any">, [number, number]> = {
  morning: [5 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 23 * 60],
};

export interface Activity {
  id: string;
  name: string;
  hoursPerWeek: number;
  minSessionHours: number;
  maxSessionHours: number;
  timeOfDay: TimeOfDay;
  color: string;
  notes: string;
}

/** A scheduled session. start/end are minutes from midnight on `day`. */
export interface Placement {
  id: string;
  activityId: string;
  day: Day;
  start: number;
  end: number;
}

export type ScheduleSource = "ai" | "fallback" | "manual";

export interface GeneratedSchedule {
  placements: Placement[];
  explanation: string;
  source: ScheduleSource;
  warnings: string[];
  generatedAt: string;
}

/** Half-open interval [start, end) in week minutes (0..10080). */
export interface Interval {
  start: number;
  end: number;
}

export type LockedKind = "event" | "sleep" | "free";

export interface LockedInterval extends Interval {
  kind: LockedKind;
  label: string;
  sourceId: string;
}
