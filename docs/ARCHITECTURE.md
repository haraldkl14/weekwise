# Weekly Planner – architecture

## Data model (`lib/types.ts`)

All times are **minutes**. Days are `0..6` = Mon..Sun. Inside the engine a point
in the week is a *week minute* `day * 1440 + minuteOfDay` (`0..10080`), and the
week wraps (Sunday night → Monday morning), so a 23:00–07:00 sleep on Sunday
lands at the start of Monday.

```ts
type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type HHMM = string;                       // "08:00" (form/storage format)

interface TimeBlock {                      // recurring event OR protected free time
  id: string; name: string; days: Day[]; start: HHMM; end: HHMM;   // end <= start ⇒ crosses midnight
}
interface SleepSchedule {
  weekday: { bedtime: HHMM; wake: HHMM };
  weekend: { bedtime: HHMM; wake: HHMM };   // used when splitWeekend
  splitWeekend: boolean;                     // weekend = wake on Sat/Sun, bed on Fri/Sat
}
interface FixedCommitments {
  events: TimeBlock[]; freeTime: TimeBlock[]; sleep: SleepSchedule;
  bufferMinutes: number;                     // around recurring events, default 15
}
interface Activity {
  id: string; name: string; hoursPerWeek: number;
  minSessionHours: number; maxSessionHours: number;
  timeOfDay: "morning" | "afternoon" | "evening" | "any";
  color: string; notes: string;
}
interface Placement { id: string; activityId: string; day: Day; start: number; end: number } // minutes of day
interface GeneratedSchedule {
  placements: Placement[]; explanation: string;
  source: "ai" | "fallback" | "manual"; warnings: string[]; generatedAt: string;
}
interface Interval { start: number; end: number }          // week minutes, half-open
interface LockedInterval extends Interval { kind: "event" | "sleep" | "free"; label: string; sourceId: string }
```

## File structure

```
lib/
  types.ts                 shared types + constants
  time/                    PURE, no React/Next imports, fully unit tested
    clock.ts               HH:MM parsing/formatting, week-minute helpers
    intervals.ts           merge / subtract / overlap / split-at-midnight
    commitments.ts         expand events, free time, sleep → LockedInterval[] (+ buffer)
    overlaps.ts            overlap warnings between commitments
    slots.ts               available slots + capacity (available vs requested hours)
    feasibility.ts         per-activity session-length feasibility
  schedule/
    validate.ts            validates any placement set (AI or manual)
    greedy.ts              deterministic fallback scheduler
    generate.ts            orchestration: AI → validate → retry ×2 → greedy
    week.ts                editable week after generation: blocks, move/resize/rename/add, overlap layout
  ai/
    scheduler.ts           provider-agnostic interface (AiScheduler)
    gemini.ts              Gemini implementation (server-only)
    prompt.ts              prompt + payload builder
    errors.ts              classify provider errors (rate limit / quota / key)
  ics.ts                   .ics export
  rateLimit.ts             in-memory sliding-window limiter
  schemas.ts               zod schemas for the API request
app/
  api/generate/route.ts    POST – the only place that talks to Gemini
  page.tsx                 the stepper app (client)
components/
  Stepper.tsx, WeekCalendar.tsx (grid on md+, day view on mobile)
  steps/FixedStep.tsx, ActivitiesStep.tsx, ScheduleStep.tsx
  forms/TimeBlockForm.tsx, SleepForm.tsx, ActivityForm.tsx
hooks/usePersistentState.ts  localStorage persistence
tests/                     Vitest
```

## Key decisions

* The server **recomputes** available slots from the commitments; it never
  trusts slots sent by the client.
* Sessions never cross midnight, start/end on 15-minute boundaries.
* Buffer applies to recurring events only (not sleep, not free time).
* API errors (rate limit, quota, bad key) are **not** silently replaced by the
  greedy result: the user sees the reason and chooses the fallback. Validation
  failures after 2 retries **are** replaced automatically, as specified.
* After generation the schedule becomes a list of `WeekBlock`s (sleep, events,
  free time and activities alike). Manual edits are unrestricted: the
  generation rules apply to the AI/greedy output, not to what the user does.
