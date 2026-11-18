import { Activity, FixedCommitments, GeneratedSchedule, Placement } from "../types";
import { availableSlots, capacity, formatHours, planSessions } from "../time";
import { AiProposal, AiProviderError, AiScheduler } from "../ai/scheduler";
import { convertRawPlacements } from "./convert";
import { greedySchedule } from "./greedy";
import { validateSchedule } from "./validate";

export const MAX_RETRIES = 2;

export class PlanningInputError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "PlanningInputError";
  }
}

/** Problems that make any schedule impossible – checked before calling the model. */
export function inputProblems(fixed: FixedCommitments, activities: Activity[]): string[] {
  const problems: string[] = [];
  if (activities.length === 0) problems.push("Add at least one activity.");
  const cap = capacity(fixed, activities);
  if (cap.overByMinutes > 0) {
    problems.push(
      `You requested ${formatHours(cap.requestedMinutes)} but only ${formatHours(cap.availableMinutes)} are free. Cut ${formatHours(cap.overByMinutes)}.`,
    );
  }
  for (const a of activities) {
    const p = planSessions(a).problem;
    if (p) problems.push(p);
  }
  return problems;
}

export function deterministicSchedule(fixed: FixedCommitments, activities: Activity[], note?: string): GeneratedSchedule {
  const problems = inputProblems(fixed, activities);
  if (problems.length) throw new PlanningInputError(problems);
  const result = greedySchedule(activities, availableSlots(fixed));
  return {
    placements: result.placements,
    explanation: result.explanation,
    source: "fallback",
    warnings: note ? [note, ...result.warnings] : result.warnings,
    generatedAt: new Date().toISOString(),
  };
}

export interface GenerateLog {
  attempts: number;
  errorsPerAttempt: string[][];
}

/**
 * AI first, validated in code, up to MAX_RETRIES corrective retries, then the
 * greedy scheduler. Provider errors (rate limits, bad key, …) are re-thrown so
 * the caller can tell the user instead of silently degrading.
 */
export async function generateSchedule(
  fixed: FixedCommitments,
  activities: Activity[],
  ai: AiScheduler,
  log: GenerateLog = { attempts: 0, errorsPerAttempt: [] },
): Promise<GeneratedSchedule> {
  const problems = inputProblems(fixed, activities);
  if (problems.length) throw new PlanningInputError(problems);

  const slots = availableSlots(fixed);
  let previous: AiProposal | null = null;
  let errors: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    log.attempts++;
    let proposal: AiProposal;
    try {
      proposal = await ai.propose({
        activities,
        slots,
        bufferMinutes: fixed.bufferMinutes,
        feedback: attempt > 0 ? { previous, errors } : undefined,
      });
    } catch (e) {
      // Unparseable output is a quality problem → retry; everything else is fatal.
      if (e instanceof AiProviderError && e.code === "bad_response") {
        previous = null;
        errors = ["Your response was not valid JSON matching the schema."];
        log.errorsPerAttempt.push(errors);
        continue;
      }
      throw e;
    }

    const converted = convertRawPlacements(proposal.placements ?? [], activities);
    const placements: Placement[] = converted.placements;
    errors = [...converted.errors, ...validateSchedule(placements, activities, slots).errors];
    log.errorsPerAttempt.push(errors);
    if (errors.length === 0) {
      return {
        placements: placements.sort((a, b) => a.day - b.day || a.start - b.start),
        explanation: proposal.explanation?.trim() || "Schedule generated.",
        source: "ai",
        warnings: attempt > 0 ? [`The AI needed ${attempt} correction${attempt > 1 ? "s" : ""} to produce a valid schedule.`] : [],
        generatedAt: new Date().toISOString(),
      };
    }
    previous = proposal;
  }

  return deterministicSchedule(
    fixed,
    activities,
    `The AI's schedule still broke the rules after ${MAX_RETRIES} retries (e.g. ${errors[0] ?? "invalid output"}), so the deterministic planner was used instead.`,
  );
}
