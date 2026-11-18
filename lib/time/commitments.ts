import {
  Day,
  DAYS,
  FixedCommitments,
  LockedInterval,
  SleepSchedule,
  TimeBlock,
  LockedKind,
  MINUTES_PER_DAY,
} from "../types";
import { parseHHMM, weekMinute } from "./clock";
import { wrapWeek } from "./intervals";

/** Expand a recurring block into week intervals (handles crossing midnight). */
export function expandTimeBlock(block: TimeBlock, kind: LockedKind): LockedInterval[] {
  const start = parseHHMM(block.start);
  let end = parseHHMM(block.end);
  if (end <= start) end += MINUTES_PER_DAY; // e.g. night shift 22:00–06:00
  const days = Array.from(new Set(block.days)).sort();
  return days.flatMap((day) =>
    wrapWeek({
      start: weekMinute(day, start),
      end: weekMinute(day, end),
      kind,
      label: block.name,
      sourceId: block.id,
    }),
  );
}

const isWeekendBedtime = (day: Day) => day === 4 || day === 5; // Fri, Sat nights
const isWeekendWake = (day: Day) => day === 5 || day === 6; // Sat, Sun mornings

/**
 * One sleep interval per night. The night "of day d" starts at d's bedtime.
 * A bedtime before noon (e.g. 00:30) is taken to be after midnight, i.e. on
 * day d+1. Sleep ends at the first wake time after the bedtime.
 */
export function expandSleep(sleep: SleepSchedule): LockedInterval[] {
  return DAYS.flatMap((day) => {
    const bedTimes = sleep.splitWeekend && isWeekendBedtime(day) ? sleep.weekend : sleep.weekday;
    const bed = parseHHMM(bedTimes.bedtime);
    const startAbs = weekMinute(day, bed < 12 * 60 ? bed + MINUTES_PER_DAY : bed);

    // Either way you wake up on the morning of day d+1.
    const morningOf = ((day + 1) % 7) as Day;
    const wakeTimes = sleep.splitWeekend && isWeekendWake(morningOf) ? sleep.weekend : sleep.weekday;
    const wake = parseHHMM(wakeTimes.wake);
    const wakeDay = Math.floor(startAbs / MINUTES_PER_DAY);

    let endAbs = wakeDay * MINUTES_PER_DAY + wake;
    while (endAbs <= startAbs) endAbs += MINUTES_PER_DAY;
    // Guard against absurd input (wake equal to bedtime would mean 24h sleep).
    if (endAbs - startAbs >= MINUTES_PER_DAY) return [];

    return wrapWeek({ start: startAbs, end: endAbs, kind: "sleep" as const, label: "Sleep", sourceId: "sleep" });
  });
}

/** Every locked interval in the week, without buffers. */
export function lockedIntervals(fixed: FixedCommitments): LockedInterval[] {
  return [
    ...expandSleep(fixed.sleep),
    ...fixed.events.flatMap((e) => expandTimeBlock(e, "event")),
    ...fixed.freeTime.flatMap((f) => expandTimeBlock(f, "free")),
  ];
}

/** Locked intervals with the buffer applied around recurring events. */
export function blockedIntervals(fixed: FixedCommitments): LockedInterval[] {
  const buffer = Math.max(0, fixed.bufferMinutes || 0);
  return lockedIntervals(fixed).flatMap((i) =>
    i.kind === "event" && buffer > 0 ? wrapWeek({ ...i, start: i.start - buffer, end: i.end + buffer }) : [i],
  );
}

/** Sanity checks for sleep input, e.g. a 15:00 bedtime typed by mistake. */
export function sleepWarnings(sleep: SleepSchedule): string[] {
  const check = (label: string, t: { bedtime: string; wake: string }) => {
    const bed = parseHHMM(t.bedtime);
    const start = bed < 12 * 60 ? bed + MINUTES_PER_DAY : bed;
    let end = parseHHMM(t.wake) + MINUTES_PER_DAY;
    while (end <= start) end += MINUTES_PER_DAY;
    const hours = (end - start) / 60;
    if (hours >= 24) return [`${label}: bedtime and wake-up are the same, so no sleep is blocked.`];
    if (hours > 14) return [`${label}: ${t.bedtime}–${t.wake} is ${hours}h of sleep. Is the bedtime right? (Bedtimes from 12:00 count as evening.)`];
    if (hours < 3) return [`${label}: only ${hours}h of sleep between ${t.bedtime} and ${t.wake}.`];
    return [];
  };
  return sleep.splitWeekend
    ? [...check("Weekday sleep", sleep.weekday), ...check("Weekend sleep", sleep.weekend)]
    : check("Sleep", sleep.weekday);
}
