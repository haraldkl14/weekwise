import { Activity, FixedCommitments, TimeBlock } from "./types";

export const ACTIVITY_COLORS = ["#2563eb", "#16a34a", "#db2777", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626"];

export function newId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export const defaultFixed = (): FixedCommitments => ({
  events: [],
  freeTime: [],
  sleep: {
    weekday: { bedtime: "23:00", wake: "07:00" },
    weekend: { bedtime: "00:00", wake: "09:00" },
    splitWeekend: false,
  },
  bufferMinutes: 15,
});

export const emptyBlock = (): TimeBlock => ({ id: newId("blk"), name: "", days: [0, 1, 2, 3, 4], start: "09:00", end: "10:00" });

export const emptyActivity = (index: number): Activity => ({
  id: newId("act"),
  name: "",
  hoursPerWeek: 3,
  minSessionHours: 1,
  maxSessionHours: 1.5,
  timeOfDay: "any",
  color: ACTIVITY_COLORS[index % ACTIVITY_COLORS.length],
  notes: "",
});

export const exampleData = (): { fixed: FixedCommitments; activities: Activity[] } => ({
  fixed: {
    ...defaultFixed(),
    sleep: { weekday: { bedtime: "23:00", wake: "06:30" }, weekend: { bedtime: "00:00", wake: "08:30" }, splitWeekend: true },
    events: [
      { id: "ex-work", name: "Work", days: [0, 1, 2, 3, 4], start: "08:00", end: "16:00" },
      { id: "ex-dinner", name: "Dinner", days: [0, 1, 2, 3, 4, 5, 6], start: "18:30", end: "19:15" },
    ],
    freeTime: [{ id: "ex-family", name: "Family time", days: [6], start: "14:00", end: "18:00" }],
  },
  activities: [
    { id: "ex-gym", name: "Gym", hoursPerWeek: 4, minSessionHours: 1, maxSessionHours: 1.5, timeOfDay: "evening", color: ACTIVITY_COLORS[0], notes: "Not right after dinner" },
    { id: "ex-spanish", name: "Spanish", hoursPerWeek: 3, minSessionHours: 0.5, maxSessionHours: 1, timeOfDay: "morning", color: ACTIVITY_COLORS[1], notes: "Spread across the week" },
    { id: "ex-project", name: "Side project", hoursPerWeek: 6, minSessionHours: 1.5, maxSessionHours: 3, timeOfDay: "any", color: ACTIVITY_COLORS[2], notes: "Longer blocks on the weekend" },
  ],
});
