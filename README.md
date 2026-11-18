# Weekly Planner

Generates a personalised weekly schedule around your fixed commitments.

1. **Fixed**: sleep (handles crossing midnight and separate weekend times), recurring events, protected free time. Shown live on a Mon–Sun calendar, with a warning when blocks overlap.
2. **Activities**: hours per week, min/max session length, preferred time of day, color, notes. Generation is blocked if you request more hours than you have free.
3. **Schedule**: Gemini proposes a schedule, the code validates it, and the AI gets up to 2 corrective retries before a deterministic planner takes over. You can drag sessions around, see hours per activity and export to `.ics`.

## Setup

```bash
npm install
cp .env.example .env.local   # then set GEMINI_API_KEY and GEMINI_MODEL
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only. Never sent to the browser. |
| `GEMINI_MODEL` | e.g. `gemini-3.8-flash`. Change models without code changes. |
| `RATE_LIMIT_PER_HOUR` | Optional, default 10 generations per IP per hour. |

Without a key the app still works: the error message offers the deterministic planner.

## Scripts

```bash
npm test            # Vitest: time math, validation, greedy planner, AI orchestration, ICS, rate limiter
npm run typecheck
npm run lint
npm run build
```

## How generation works

```
commitments ──► lib/time (pure) ──► free slots (minus sleep, events ± buffer, free time)
                                          │
activities ──────────────────────────────►├──► AiScheduler.propose()  (Gemini, JSON schema)
                                          │          │
                                          │          ▼
                                          │    validateSchedule()  ── errors ──► retry (max 2)
                                          │          │ valid
                                          ▼          ▼
                                   greedySchedule()  result
                              (after 2 failed retries, or when the user picks it
                               after an API error)
```

* The server **recomputes** free slots from the raw commitments. Slots sent by the client are never trusted.
* Validation checks: inside a free slot (no overlap with locked time or buffer), no overlaps between sessions, session length within min/max, and weekly total within ±0.5h.
* Provider errors (invalid key, rate limit, quota, outage) are **not** silently replaced by the fallback. The user sees what went wrong and chooses the deterministic planner.
* To change providers, implement `AiScheduler` (`lib/ai/scheduler.ts`) and return it from `lib/ai/index.ts`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model.

## Known limitations

* **The rate limiter is in-memory.** It works for a single `next start` process. On serverless or multi-instance hosting (e.g. Vercel) each instance counts separately and the limit leaks. Use Redis/Upstash before relying on it for cost control. Also, one "generation" can be up to 3 Gemini calls (1 + 2 retries).
* `x-forwarded-for` is trusted for the client IP. That's fine behind a proxy that sets it, but a client can spoof it if the app is exposed directly.
* `Available hours ≥ requested hours` doesn't guarantee a fit: free gaps can be too short for your minimum session length. When that happens the planner reports the shortfall per activity instead of breaking a rule.
* Drag & drop uses HTML5 DnD (desktop). On touch devices, tap a session to move it with the day/time picker.
* `.ics` events use floating local times (no time zone), so calendars show them in your current zone.
* The deterministic planner ignores free-text notes. Only the AI reads them.
