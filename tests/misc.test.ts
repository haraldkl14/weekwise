import { describe, expect, it } from "vitest";
import { availableSlots } from "@/lib/time";
import { movePlacement } from "@/lib/schedule/move";
import { buildIcs, escapeText, mondayOf } from "@/lib/ics";
import { RateLimiter, clientIp } from "@/lib/rateLimit";
import { classifyProviderError } from "@/lib/ai/errors";
import { buildUserPrompt } from "@/lib/ai/prompt";
import { generateRequestSchema } from "@/lib/schemas";
import { Placement } from "@/lib/types";
import { activity, fixed, WORK } from "./fixtures";

const SLOTS = availableSlots(fixed({ events: [WORK] }));
const placements: Placement[] = [
  { id: "a", activityId: "gym", day: 0, start: 18 * 60, end: 19 * 60 },
  { id: "b", activityId: "gym", day: 1, start: 18 * 60, end: 19 * 60 },
];

describe("movePlacement", () => {
  it("moves into free time and snaps to 15 minutes", () => {
    const r = movePlacement(placements, "a", 2, 20 * 60 + 8, SLOTS); // nearest quarter: 20:15
    expect(r.ok && r.placements[0]).toEqual({ id: "a", activityId: "gym", day: 2, start: 20 * 60 + 15, end: 21 * 60 + 15 });
  });
  it("rejects dropping onto a locked block or its buffer", () => {
    expect(movePlacement(placements, "a", 2, 10 * 60, SLOTS).ok).toBe(false);
    expect(movePlacement(placements, "a", 2, 15 * 60 + 30, SLOTS).ok).toBe(false); // ends in buffer
    expect(movePlacement(placements, "a", 2, 22 * 60 + 30, SLOTS).ok).toBe(false); // runs into sleep
  });
  it("rejects collisions with other sessions but allows moving onto itself", () => {
    expect(movePlacement(placements, "a", 1, 18 * 60 + 30, SLOTS)).toMatchObject({ ok: false, reason: expect.stringContaining("another session") });
    expect(movePlacement(placements, "a", 0, 18 * 60 + 30, SLOTS).ok).toBe(true);
  });
});

describe("ics export", () => {
  const acts = [activity({ id: "gym", name: "Gym, legs; core", notes: "bring\nshoes" })];
  const ics = buildIcs(
    [...placements, { id: "late", activityId: "gym", day: 6, start: 23 * 60, end: 24 * 60 }],
    acts,
    { weekStart: new Date(2026, 10, 16), now: new Date(Date.UTC(2026, 10, 18, 9, 0, 0)), repeatWeeks: 4 },
  );

  it("emits one VEVENT per placement with local floating times", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("DTSTART:20261116T180000");
    expect(ics).toContain("DTEND:20261117T190000");
    expect(ics).toContain("DTSTAMP:20261118T090000Z");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;COUNT=4");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
  it("turns an end of 24:00 into 00:00 the next day", () => {
    expect(ics).toContain("DTSTART:20261122T230000");
    expect(ics).toContain("DTEND:20261123T000000");
  });
  it("escapes text", () => {
    expect(ics).toContain("SUMMARY:Gym\\, legs\; core");
    expect(escapeText("a\nb\\c")).toBe("a\\nb\\\\c");
  });
  it("finds the Monday of a week", () => {
    expect(mondayOf(new Date(2026, 10, 22)).getDate()).toBe(16); // Sunday → previous Monday
    expect(mondayOf(new Date(2026, 10, 16)).getDate()).toBe(16);
  });
});

describe("RateLimiter", () => {
  it("allows N requests per window per key", () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.check("ip", 0).allowed).toBe(true);
    expect(rl.check("ip", 1).allowed).toBe(true);
    const blocked = rl.check("ip", 2);
    expect(blocked).toMatchObject({ allowed: false, retryAfterSeconds: 60 });
    expect(rl.check("other", 2).allowed).toBe(true);
    expect(rl.check("ip", 60_001).allowed).toBe(true);
  });
  it("reads the client ip from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("classifyProviderError", () => {
  const err = (status: number, message: string) => Object.assign(new Error(message), { status });
  it("maps Gemini errors to user-facing codes", () => {
    expect(classifyProviderError(err(400, "API key not valid. Please pass a valid API key.")).code).toBe("invalid_key");
    expect(classifyProviderError(err(429, "Resource has been exhausted (e.g. check quota).")).code).toBe("rate_limited");
    expect(classifyProviderError(err(429, "You exceeded your current quota, please check your plan and billing")).code).toBe("quota_exceeded");
    expect(classifyProviderError(err(503, "The model is overloaded")).code).toBe("unavailable");
    expect(classifyProviderError(err(404, "models/foo is not found")).code).toBe("not_configured");
    expect(classifyProviderError(new Error("???")).code).toBe("unknown");
  });
});

describe("prompt", () => {
  it("lists slots per day, activities and retry feedback", () => {
    const text = buildUserPrompt({
      activities: [activity({ id: "gym", name: "Gym", notes: "not after dinner" })],
      slots: SLOTS,
      bufferMinutes: 15,
      feedback: { previous: null, errors: ["bad thing"] },
    });
    expect(text).toContain("Mon: 07:00-07:45, 16:15-23:00");
    expect(text).toContain("not after dinner");
    expect(text).toContain("- bad thing");
  });
});

describe("request schema", () => {
  it("rejects malformed input", () => {
    const ok = {
      fixed: fixed({ events: [WORK] }),
      activities: [activity()],
    };
    expect(generateRequestSchema.safeParse(ok).success).toBe(true);
    expect(generateRequestSchema.safeParse({ ...ok, activities: [activity({ minSessionHours: 3, maxSessionHours: 1 })] }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ ...ok, activities: [activity({ hoursPerWeek: 1.1 })] }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ ...ok, activities: [] }).success).toBe(false);
  });
});
