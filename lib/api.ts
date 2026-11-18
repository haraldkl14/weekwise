import type { Activity, FixedCommitments, GeneratedSchedule } from "./types";
import type { AiErrorCode } from "./ai/scheduler";

export type GenerateErrorCode = AiErrorCode | "invalid_input" | "too_many_generations" | "network";

export interface GenerateErrorBody {
  error: { code: GenerateErrorCode; message: string; problems?: string[]; fallbackAvailable?: boolean };
}

export type GenerateResponse = { ok: true; schedule: GeneratedSchedule } | ({ ok: false } & GenerateErrorBody);

/** Client-side helper for POST /api/generate. Never throws. */
export async function requestSchedule(fixed: FixedCommitments, activities: Activity[]): Promise<GenerateResponse> {
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixed, activities }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.schedule) return { ok: true, schedule: body.schedule };
    if (body?.error) return { ok: false, error: body.error };
    return { ok: false, error: { code: "unknown", message: `Server error (${res.status}).`, fallbackAvailable: true } };
  } catch {
    return { ok: false, error: { code: "network", message: "Could not reach the server. Check your connection.", fallbackAvailable: true } };
  }
}
