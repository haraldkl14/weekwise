import { Activity, Placement } from "./types";

export interface IcsOptions {
  /** Monday of the week to export (local date). */
  weekStart: Date;
  /** Add a weekly RRULE so the plan repeats. */
  repeatWeeks?: number;
  /** Fixed for deterministic output in tests. */
  now?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Floating local time (no Z / TZID): calendars show it in the user's zone. */
function localStamp(date: Date, minutes: number): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 24) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h % 24)}${pad(m)}00`;
}

function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 text escaping. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const octets = (s: string) => new TextEncoder().encode(s).length;

/** Fold lines longer than 75 octets (works in the browser and Node). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (octets(rest) > 75) {
    let cut = 75;
    while (octets(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function buildIcs(placements: Placement[], activities: Activity[], opts: IcsOptions): string {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const stamp = utcStamp(opts.now ?? new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Weekly Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const p of placements) {
    const a = byId.get(p.activityId);
    if (!a) continue;
    const day = new Date(opts.weekStart.getFullYear(), opts.weekStart.getMonth(), opts.weekStart.getDate() + p.day);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.id}-${localStamp(day, p.start)}@weekly-planner`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${localStamp(day, p.start)}`,
      `DTEND:${localStamp(day, p.end)}`,
      `SUMMARY:${escapeText(a.name)}`,
    );
    if (a.notes.trim()) lines.push(`DESCRIPTION:${escapeText(a.notes.trim())}`);
    if (opts.repeatWeeks && opts.repeatWeeks > 1) lines.push(`RRULE:FREQ=WEEKLY;COUNT=${opts.repeatWeeks}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
