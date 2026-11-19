import { describe, expect, it } from "vitest";
import { availableSlots } from "@/lib/time";
import { validateSchedule } from "@/lib/schedule/validate";
import { greedySchedule } from "@/lib/schedule/greedy";
import { generateSchedule, PlanningInputError, inputProblems } from "@/lib/schedule/generate";
import { convertRawPlacements } from "@/lib/schedule/convert";
import { AiProposal, AiProviderError, AiScheduleRequest, AiScheduler } from "@/lib/ai/scheduler";
import { Placement } from "@/lib/types";
import { activity, block, fixed, WORK } from "./fixtures";

const F = fixed({ events: [WORK] });
const SLOTS = availableSlots(F);
const gym = activity({ id: "gym", name: "Gym", hoursPerWeek: 3, minSessionHours: 1, maxSessionHours: 1.5, timeOfDay: "evening" });
const read = activity({ id: "read", name: "Reading", hoursPerWeek: 2, minSessionHours: 0.5, maxSessionHours: 1, timeOfDay: "morning" });

const p = (activityId: string, day: number, start: string, end: string): Placement => {
  const t = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return { id: `${activityId}${day}${start}`, activityId, day: day as Placement["day"], start: t(start), end: t(end) };
};

describe("validateSchedule", () => {
  it("accepts a valid schedule", () => {
    const placements = [p("gym", 0, "18:00", "19:30"), p("gym", 2, "18:00", "19:30")];
    expect(validateSchedule(placements, [gym], SLOTS)).toEqual({ valid: true, errors: [] });
  });

  it("rejects sessions in locked time, including the buffer", () => {
    const r = validateSchedule([p("gym", 0, "16:00", "17:30"), p("gym", 1, "18:00", "19:30")], [gym], SLOTS);
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("locked block");
  });

  it("rejects sessions during sleep", () => {
    const r = validateSchedule([p("gym", 0, "06:00", "07:30"), p("gym", 1, "18:00", "19:30")], [gym], SLOTS);
    expect(r.errors.some((e) => e.includes("Mon 06:00") && e.includes("locked"))).toBe(true);
  });

  it("rejects overlapping sessions", () => {
    const r = validateSchedule(
      [p("gym", 0, "18:00", "19:30"), p("gym", 1, "18:00", "19:30"), p("read", 0, "19:00", "20:00"), p("read", 1, "20:00", "21:00")],
      [gym, read],
      SLOTS,
    );
    expect(r.errors.filter((e) => e.includes("overlaps \""))).toHaveLength(1);
  });

  it("rejects session lengths outside min/max and missed weekly targets", () => {
    const r = validateSchedule([p("gym", 0, "18:00", "18:30")], [gym], SLOTS);
    expect(r.errors.some((e) => e.includes("must be between 1h and 1.5h"))).toBe(true);
    expect(r.errors.some((e) => e.includes("target is 3h"))).toBe(true);
  });

  it("allows ±0.5h tolerance on weekly hours", () => {
    const ok = [p("gym", 0, "18:00", "19:15"), p("gym", 2, "18:00", "19:15")]; // 2.5h
    expect(validateSchedule(ok, [gym], SLOTS).valid).toBe(true);
    const short = [p("gym", 0, "18:00", "19:00"), p("gym", 2, "18:00", "19:15")]; // 2.25h
    expect(validateSchedule(short, [gym], SLOTS).valid).toBe(false);
  });

});

describe("greedySchedule", () => {
  it("produces a valid schedule and honours time-of-day preferences", () => {
    const r = greedySchedule([gym, read], SLOTS);
    expect(r.warnings).toEqual([]);
    expect(validateSchedule(r.placements, [gym, read], SLOTS)).toEqual({ valid: true, errors: [] });
    for (const pl of r.placements.filter((x) => x.activityId === "gym")) expect(pl.start).toBeGreaterThanOrEqual(17 * 60);
    for (const pl of r.placements.filter((x) => x.activityId === "read")) expect(pl.end).toBeLessThanOrEqual(12 * 60);
  });

  it("spreads sessions across different days", () => {
    const r = greedySchedule([activity({ id: "run", hoursPerWeek: 4, minSessionHours: 1, maxSessionHours: 1 })], SLOTS);
    expect(new Set(r.placements.map((x) => x.day)).size).toBe(4);
  });

  it("reports a shortfall instead of producing an invalid schedule when gaps are too short", () => {
    // Only Mon 07:00–07:45 + evenings removed by a huge free-time block → 2h sessions can't fit.
    const tight = fixed({
      events: [WORK],
      freeTime: [block({ name: "Family", days: [0, 1, 2, 3, 4, 5, 6], start: "07:00", end: "22:00" })],
    });
    const long = activity({ id: "long", name: "Long", hoursPerWeek: 4, minSessionHours: 2, maxSessionHours: 2 });
    const r = greedySchedule([long], availableSlots(tight));
    expect(r.placements).toEqual([]);
    expect(r.warnings[0]).toContain("Only 0h of 4h");
  });

  it("fits a fully booked week exactly", () => {
    const only = fixed({ freeTime: [block({ name: "Rest", days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "23:00" })] });
    // 2h free per day (07:00–09:00) = 14h
    const r = greedySchedule([activity({ id: "x", hoursPerWeek: 14, minSessionHours: 2, maxSessionHours: 2 })], availableSlots(only));
    expect(r.placements).toHaveLength(7);
    expect(r.warnings).toEqual([]);
  });
});

describe("convertRawPlacements", () => {
  it("parses days, times and 24:00, and reports junk", () => {
    const r = convertRawPlacements(
      [
        { activity: "gym", day: "Monday", start: "22:00", end: "24:00" },
        { activity: "nope", day: "Mon", start: "10:00", end: "11:00" },
        { activity: "gym", day: "Funday", start: "10:00", end: "11:00" },
        { activity: "gym", day: "Tue", start: "7pm", end: "8pm" },
      ],
      [gym],
    );
    expect(r.placements).toEqual([{ id: "p0", activityId: "gym", day: 0, start: 1320, end: 1440 }]);
    expect(r.errors).toHaveLength(3);
  });
});

class FakeAi implements AiScheduler {
  name = "fake";
  calls: AiScheduleRequest[] = [];
  constructor(private responses: (AiProposal | Error)[]) {}
  async propose(req: AiScheduleRequest) {
    this.calls.push(req);
    const r = this.responses[Math.min(this.calls.length - 1, this.responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  }
}

const GOOD: AiProposal = {
  placements: [
    { activity: "gym", day: "Mon", start: "18:00", end: "19:30" },
    { activity: "gym", day: "Wed", start: "18:00", end: "19:30" },
  ],
  explanation: "Gym on Monday and Wednesday evenings.",
};
const BAD: AiProposal = {
  placements: [{ activity: "gym", day: "Mon", start: "12:00", end: "15:00" }],
  explanation: "Oops.",
};

describe("generateSchedule (AI orchestration)", () => {
  it("returns the AI schedule when it validates", async () => {
    const ai = new FakeAi([GOOD]);
    const s = await generateSchedule(F, [gym], ai);
    expect(s.source).toBe("ai");
    expect(s.explanation).toContain("Monday");
    expect(ai.calls).toHaveLength(1);
  });

  it("feeds validation errors back and retries", async () => {
    const ai = new FakeAi([BAD, GOOD]);
    const s = await generateSchedule(F, [gym], ai);
    expect(s.source).toBe("ai");
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1].feedback?.errors.join()).toContain("locked block");
    expect(ai.calls[1].feedback?.previous).toEqual(BAD);
  });

  it("falls back to greedy after 2 failed retries (3 calls total)", async () => {
    const ai = new FakeAi([BAD]);
    const s = await generateSchedule(F, [gym], ai);
    expect(ai.calls).toHaveLength(3);
    expect(s.source).toBe("fallback");
    expect(s.warnings[0]).toContain("after 2 retries");
    expect(validateSchedule(s.placements, [gym], availableSlots(F)).valid).toBe(true);
  });

  it("treats unparseable output as retryable", async () => {
    const ai = new FakeAi([new AiProviderError("bad_response", "not json"), GOOD]);
    expect((await generateSchedule(F, [gym], ai)).source).toBe("ai");
  });

  it("re-throws provider errors such as rate limits", async () => {
    const ai = new FakeAi([new AiProviderError("rate_limited", "slow down")]);
    await expect(generateSchedule(F, [gym], ai)).rejects.toMatchObject({ code: "rate_limited" });
    expect(ai.calls).toHaveLength(1);
  });

  it("refuses over-requested hours without calling the AI", async () => {
    const ai = new FakeAi([GOOD]);
    await expect(generateSchedule(F, [activity({ hoursPerWeek: 200, maxSessionHours: 4 })], ai)).rejects.toBeInstanceOf(PlanningInputError);
    expect(ai.calls).toHaveLength(0);
    expect(inputProblems(F, [activity({ hoursPerWeek: 200, maxSessionHours: 4 })])[0]).toContain("Cut 130.5h");
  });
});
