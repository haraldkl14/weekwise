import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM");
const day = z.number().int().min(0).max(6);
const name = z.string().trim().min(1).max(80);

const timeBlock = z.object({
  id: z.string().min(1).max(64),
  name,
  days: z.array(day).min(1).max(7),
  start: hhmm,
  end: hhmm,
});

const sleepTimes = z.object({ bedtime: hhmm, wake: hhmm });

export const fixedSchema = z.object({
  events: z.array(timeBlock).max(50),
  freeTime: z.array(timeBlock).max(50),
  sleep: z.object({ weekday: sleepTimes, weekend: sleepTimes, splitWeekend: z.boolean() }),
  bufferMinutes: z.number().int().min(0).max(120),
});

const quarterHours = z.number().positive().max(168).refine((h) => Number.isInteger(h * 4), "Use 15-minute steps");

export const activitySchema = z
  .object({
    id: z.string().min(1).max(64),
    name,
    hoursPerWeek: quarterHours,
    minSessionHours: quarterHours,
    maxSessionHours: quarterHours,
    timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    notes: z.string().max(500),
  })
  .refine((a) => a.minSessionHours <= a.maxSessionHours, "Min session must not exceed max session");

export const generateRequestSchema = z.object({
  fixed: fixedSchema,
  activities: z.array(activitySchema).min(1).max(30),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
