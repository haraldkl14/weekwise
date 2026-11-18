import { Activity, FixedCommitments, TimeBlock } from "@/lib/types";

export const block = (p: Partial<TimeBlock> & Pick<TimeBlock, "start" | "end" | "days">): TimeBlock => ({
  id: p.id ?? `b-${p.name ?? "x"}-${p.start}`,
  name: p.name ?? "Block",
  ...p,
});

export const fixed = (p: Partial<FixedCommitments> = {}): FixedCommitments => ({
  events: [],
  freeTime: [],
  sleep: {
    weekday: { bedtime: "23:00", wake: "07:00" },
    weekend: { bedtime: "23:00", wake: "07:00" },
    splitWeekend: false,
  },
  bufferMinutes: 15,
  ...p,
});

export const activity = (p: Partial<Activity> = {}): Activity => ({
  id: p.id ?? `act-${p.name ?? "x"}`,
  name: "Activity",
  hoursPerWeek: 3,
  minSessionHours: 1,
  maxSessionHours: 1.5,
  timeOfDay: "any",
  color: "#3b82f6",
  notes: "",
  ...p,
});

export const WORK = block({ id: "work", name: "Work", days: [0, 1, 2, 3, 4], start: "08:00", end: "16:00" });
