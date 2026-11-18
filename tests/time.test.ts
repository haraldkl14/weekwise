import { describe, expect, it } from "vitest";
import {
  availableMinutes,
  availableSlots,
  capacity,
  expandSleep,
  expandTimeBlock,
  findOverlaps,
  formatHHMM,
  formatHours,
  mergeIntervals,
  parseHHMM,
  planSessions,
  subtractIntervals,
  wrapWeek,
} from "@/lib/time";
import { MINUTES_PER_WEEK } from "@/lib/types";
import { activity, block, fixed, WORK } from "./fixtures";

const H = 60;
const D = 1440;

describe("clock", () => {
  it("parses and formats HH:MM", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("23:59")).toBe(1439);
    expect(formatHHMM(510)).toBe("08:30");
    expect(formatHHMM(1440)).toBe("24:00");
    expect(() => parseHHMM("24:00")).toThrow();
    expect(() => parseHHMM("8:00")).toThrow();
    expect(formatHours(90)).toBe("1.5h");
    expect(formatHours(135)).toBe("2.25h");
  });
});

describe("intervals", () => {
  it("merges overlapping and touching intervals", () => {
    expect(mergeIntervals([{ start: 10, end: 20 }, { start: 0, end: 5 }, { start: 5, end: 12 }, { start: 30, end: 40 }])).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ]);
  });

  it("subtracts overlapping holes", () => {
    expect(
      subtractIntervals([{ start: 0, end: 100 }], [{ start: 10, end: 30 }, { start: 20, end: 40 }, { start: 90, end: 200 }]),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 40, end: 90 },
    ]);
  });

  it("wraps intervals that run past the end of the week", () => {
    expect(wrapWeek({ start: MINUTES_PER_WEEK - 60, end: MINUTES_PER_WEEK + 120 })).toEqual([
      { start: MINUTES_PER_WEEK - 60, end: MINUTES_PER_WEEK },
      { start: 0, end: 120 },
    ]);
    expect(wrapWeek({ start: -30, end: 30 })).toEqual([
      { start: MINUTES_PER_WEEK - 30, end: MINUTES_PER_WEEK },
      { start: 0, end: 30 },
    ]);
  });
});

describe("sleep crossing midnight", () => {
  it("23:00–07:00 produces 8h per night, Sunday night wraps into Monday morning", () => {
    const nights = expandSleep(fixed().sleep);
    const total = nights.reduce((s, n) => s + n.end - n.start, 0);
    expect(total).toBe(7 * 8 * H);
    // Monday 00:00–07:00 comes from Sunday night
    expect(nights).toContainEqual(expect.objectContaining({ start: 0, end: 7 * H }));
    // Monday 23:00 → Tuesday 07:00
    expect(nights).toContainEqual(expect.objectContaining({ start: 23 * H, end: D + 7 * H }));
    // Sunday 23:00 → end of week
    expect(nights).toContainEqual(expect.objectContaining({ start: 6 * D + 23 * H, end: MINUTES_PER_WEEK }));
  });

  it("treats a bedtime after midnight (00:30) as the next calendar day", () => {
    const nights = expandSleep({
      weekday: { bedtime: "00:30", wake: "08:00" },
      weekend: { bedtime: "00:30", wake: "08:00" },
      splitWeekend: false,
    });
    // Monday night: Tue 00:30 → Tue 08:00
    expect(nights).toContainEqual(expect.objectContaining({ start: D + 30, end: D + 8 * H }));
    expect(nights.reduce((s, n) => s + n.end - n.start, 0)).toBe(7 * 7.5 * H);
  });

  it("applies weekend times to Fri/Sat bedtimes and Sat/Sun wake-ups", () => {
    const nights = expandSleep({
      weekday: { bedtime: "22:30", wake: "06:30" },
      weekend: { bedtime: "00:00", wake: "09:00" },
      splitWeekend: true,
    });
    // Thursday night: weekday bedtime, Friday morning is a weekday wake.
    expect(nights).toContainEqual(expect.objectContaining({ start: 3 * D + 22 * H + 30, end: 4 * D + 6 * H + 30 }));
    // Friday night: weekend bedtime (00:00 = Sat 00:00) → Sat 09:00
    expect(nights).toContainEqual(expect.objectContaining({ start: 5 * D, end: 5 * D + 9 * H }));
    // Sunday night: weekday bedtime 22:30, Monday weekday wake 06:30 (wrapped)
    expect(nights).toContainEqual(expect.objectContaining({ start: 6 * D + 22 * H + 30, end: MINUTES_PER_WEEK }));
    expect(nights).toContainEqual(expect.objectContaining({ start: 0, end: 6 * H + 30 }));
  });

  it("does not use weekend times when splitWeekend is off", () => {
    const nights = expandSleep({
      weekday: { bedtime: "23:00", wake: "07:00" },
      weekend: { bedtime: "02:00", wake: "11:00" },
      splitWeekend: false,
    });
    expect(nights.reduce((s, n) => s + n.end - n.start, 0)).toBe(7 * 8 * H);
  });
});

describe("recurring blocks", () => {
  it("expands a block for each selected day", () => {
    const out = expandTimeBlock(WORK, "event");
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ start: 8 * H, end: 16 * H, kind: "event", label: "Work" });
  });

  it("handles an event crossing midnight, including Sunday → Monday", () => {
    const shift = block({ name: "Night shift", days: [6], start: "22:00", end: "06:00" });
    expect(expandTimeBlock(shift, "event")).toEqual([
      expect.objectContaining({ start: 6 * D + 22 * H, end: MINUTES_PER_WEEK }),
      expect.objectContaining({ start: 0, end: 6 * H }),
    ]);
  });
});

describe("available slots", () => {
  it("removes sleep, events with buffer and free time", () => {
    const f = fixed({
      events: [WORK],
      freeTime: [block({ name: "Family", days: [6], start: "15:00", end: "18:00" })],
    });
    const monday = availableSlots(f).filter((s) => s.day === 0);
    // 07:00–07:45 and 16:15–23:00
    expect(monday).toEqual([
      { day: 0, start: 7 * H, end: 7 * H + 45 },
      { day: 0, start: 16 * H + 15, end: 23 * H },
    ]);
    const sunday = availableSlots(f).filter((s) => s.day === 6);
    expect(sunday).toEqual([
      { day: 6, start: 7 * H, end: 15 * H },
      { day: 6, start: 18 * H, end: 23 * H },
    ]);
  });

  it("buffer is configurable and can be 0", () => {
    const withBuffer = availableMinutes(fixed({ events: [WORK], bufferMinutes: 15 }));
    const without = availableMinutes(fixed({ events: [WORK], bufferMinutes: 0 }));
    expect(without - withBuffer).toBe(5 * 30);
    // 7 days × 16h awake − 5 × 8h work
    expect(without).toBe(7 * 16 * H - 5 * 8 * H);
  });

  it("overlapping inputs are not double-subtracted", () => {
    const meeting = block({ name: "Meeting", days: [0], start: "15:00", end: "17:00" });
    const a = availableMinutes(fixed({ events: [WORK, meeting], bufferMinutes: 0 }));
    const b = availableMinutes(fixed({ events: [WORK], bufferMinutes: 0 }));
    expect(b - a).toBe(60); // only 16:00–17:00 is new
  });

  it("never produces slots crossing midnight and snaps to 15 minutes", () => {
    const f = fixed({
      sleep: { weekday: { bedtime: "02:00", wake: "06:10" }, weekend: { bedtime: "02:00", wake: "06:10" }, splitWeekend: false },
      bufferMinutes: 0,
    });
    for (const s of availableSlots(f)) {
      expect(s.start % 15).toBe(0);
      expect(s.end % 15).toBe(0);
      expect(s.end).toBeLessThanOrEqual(D);
    }
    // 06:10 rounds up to 06:15
    expect(availableSlots(f).find((s) => s.day === 0)?.start).toBe(0);
    expect(availableSlots(f).filter((s) => s.day === 1)[1]).toEqual({ day: 1, start: 6 * H + 15, end: D });
  });
});

describe("overlap warnings", () => {
  it("reports overlapping commitments once per pair", () => {
    const gym = block({ id: "gym", name: "Gym", days: [0, 2], start: "15:00", end: "17:00" });
    const warnings = findOverlaps(fixed({ events: [WORK, gym] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("Mon 15:00–16:00");
  });

  it("detects events overlapping sleep across midnight", () => {
    const late = block({ id: "late", name: "Late call", days: [6], start: "22:00", end: "00:30" });
    const w = findOverlaps(fixed({ events: [late] }));
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/Sun 23:00–24:00|Mon 00:00–00:30/);
  });

  it("returns nothing when blocks only touch", () => {
    const after = block({ id: "after", name: "Gym", days: [0], start: "16:00", end: "17:00" });
    expect(findOverlaps(fixed({ events: [WORK, after] }))).toEqual([]);
  });
});

describe("capacity", () => {
  it("blocks generation and reports how much to cut when over-requested", () => {
    const f = fixed({ events: [WORK], bufferMinutes: 0 }); // 72h free
    const c = capacity(f, [activity({ hoursPerWeek: 50 }), activity({ id: "b", hoursPerWeek: 30 })]);
    expect(c.availableMinutes).toBe(72 * H);
    expect(c.requestedMinutes).toBe(80 * H);
    expect(c.overByMinutes).toBe(8 * H);
    expect(c.canGenerate).toBe(false);
  });

  it("allows generation when it fits exactly", () => {
    const c = capacity(fixed({ events: [WORK], bufferMinutes: 0 }), [activity({ hoursPerWeek: 72 })]);
    expect(c.overByMinutes).toBe(0);
    expect(c.canGenerate).toBe(true);
  });

  it("cannot generate with no activities", () => {
    expect(capacity(fixed(), []).canGenerate).toBe(false);
  });
});

describe("session planning", () => {
  it("splits evenly with as few sessions as possible", () => {
    expect(planSessions(activity({ hoursPerWeek: 5, minSessionHours: 1, maxSessionHours: 2 })).lengths).toEqual([105, 105, 90]);
    expect(planSessions(activity({ hoursPerWeek: 4, minSessionHours: 1, maxSessionHours: 2 })).lengths).toEqual([120, 120]);
  });

  it("uses the tolerance when min session is slightly too long", () => {
    // 2.5h with 1h–1h sessions → 3 × 1h = 3h (within +0.5h)
    expect(planSessions(activity({ hoursPerWeek: 2.5, minSessionHours: 1, maxSessionHours: 1 })).lengths).toEqual([60, 60, 60]);
  });

  it("flags impossible combinations", () => {
    const p = planSessions(activity({ name: "Piano", hoursPerWeek: 3, minSessionHours: 2, maxSessionHours: 2 }));
    expect(p.lengths).toEqual([]);
    expect(p.problem).toContain("Piano");
    expect(planSessions(activity({ minSessionHours: 2, maxSessionHours: 1 })).problem).toBeDefined();
    expect(planSessions(activity({ minSessionHours: 0.3 })).problem).toBeDefined();
  });
});
