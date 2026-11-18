import { DAY_SHORT, TIME_OF_DAY_RANGES } from "../types";
import { formatHHMM } from "../time";
import type { AiScheduleRequest } from "./scheduler";

export const SYSTEM_INSTRUCTION = `You are a careful weekly planning assistant.
You place activity sessions into a person's FREE time slots for one week (Mon–Sun).
Hard rules – an answer that breaks any of them is rejected:
1. Every session must lie completely inside ONE listed free slot on the same day. Never use time outside the slots.
2. Sessions must not overlap each other.
3. Each session length must be between the activity's minSessionHours and maxSessionHours.
4. The total per activity must be within ±0.5h of hoursPerWeek.
5. Start and end times are "HH:MM" on 15-minute boundaries (:00, :15, :30, :45). Use "24:00" only as an end time.
6. "activity" must be the activity id exactly as given.
Soft preferences (follow when possible): preferred time of day, the user's notes, spreading an activity across the week instead of stacking it, leaving short gaps between sessions.
The explanation must be 2–4 plain sentences describing the main choices, addressed to the user ("you").`;

export function buildUserPrompt(req: AiScheduleRequest): string {
  const slotsByDay = DAY_SHORT.map((d, i) => {
    const daySlots = req.slots.filter((s) => s.day === i).map((s) => `${formatHHMM(s.start)}-${formatHHMM(s.end)}`);
    return `${d}: ${daySlots.length ? daySlots.join(", ") : "(no free time)"}`;
  }).join("\n");

  const activities = req.activities.map((a) => ({
    id: a.id,
    name: a.name,
    hoursPerWeek: a.hoursPerWeek,
    minSessionHours: a.minSessionHours,
    maxSessionHours: a.maxSessionHours,
    preferredTimeOfDay:
      a.timeOfDay === "any"
        ? "any"
        : `${a.timeOfDay} (${formatHHMM(TIME_OF_DAY_RANGES[a.timeOfDay][0])}-${formatHHMM(TIME_OF_DAY_RANGES[a.timeOfDay][1])})`,
    notes: a.notes.trim() || undefined,
  }));

  let prompt = `FREE SLOTS (already exclude sleep, fixed events with a ${req.bufferMinutes}-minute buffer, and protected free time):
${slotsByDay}

ACTIVITIES:
${JSON.stringify(activities, null, 2)}

Return every session as a placement.`;

  if (req.feedback) {
    prompt += `

YOUR PREVIOUS ANSWER WAS REJECTED. Fix every problem below and return a complete new schedule:
${req.feedback.errors.map((e) => `- ${e}`).join("\n")}`;
    if (req.feedback.previous) {
      prompt += `

Previous placements:
${JSON.stringify(req.feedback.previous.placements)}`;
    }
  }
  return prompt;
}
