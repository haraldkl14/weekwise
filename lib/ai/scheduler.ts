import type { Activity } from "../types";
import type { DaySlot } from "../time";

/** What the model returns, before any validation. */
export interface RawPlacement {
  activity: string;
  day: string;
  start: string;
  end: string;
}

export interface AiProposal {
  placements: RawPlacement[];
  explanation: string;
}

export interface AiScheduleRequest {
  activities: Activity[];
  slots: DaySlot[];
  bufferMinutes: number;
  /** Present on retries: what was wrong with the previous answer. */
  feedback?: { previous: AiProposal | null; errors: string[] };
}

export type AiErrorCode =
  | "not_configured"
  | "invalid_key"
  | "rate_limited"
  | "quota_exceeded"
  | "unavailable"
  | "bad_response"
  | "unknown";

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiProviderError";
  }
}

/**
 * Provider-agnostic interface. Swap Gemini for another model by implementing
 * this and changing `getScheduler()` in lib/ai/index.ts.
 */
export interface AiScheduler {
  readonly name: string;
  propose(request: AiScheduleRequest): Promise<AiProposal>;
}
