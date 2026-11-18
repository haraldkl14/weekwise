import { getScheduler } from "@/lib/ai";
import { AiProviderError } from "@/lib/ai/scheduler";
import { classifyProviderError } from "@/lib/ai/errors";
import { generateSchedule, inputProblems } from "@/lib/schedule/generate";
import { generateRequestSchema } from "@/lib/schemas";
import { clientIp, RateLimiter } from "@/lib/rateLimit";
import type { GenerateErrorBody } from "@/lib/api";

export const maxDuration = 60;

const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_HOUR) || 10, 60 * 60 * 1000);

const fail = (status: number, body: GenerateErrorBody, headers?: HeadersInit) => Response.json(body, { status, headers });

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail(400, { error: { code: "invalid_input", message: "Request body must be JSON." } });
  }

  const parsed = generateRequestSchema.safeParse(json);
  if (!parsed.success) {
    return fail(400, {
      error: { code: "invalid_input", message: "Some inputs are invalid.", problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
    });
  }
  const { fixed, activities } = parsed.data;

  // Reject impossible requests before spending rate-limit budget or API calls.
  const problems = inputProblems(fixed, activities);
  if (problems.length) return fail(400, { error: { code: "invalid_input", message: problems[0], problems } });

  const rl = limiter.check(clientIp(request.headers));
  if (!rl.allowed) {
    return fail(
      429,
      {
        error: {
          code: "too_many_generations",
          message: `You've reached the limit of AI generations for this hour. Try again in ${Math.ceil(rl.retryAfterSeconds / 60)} min, or use the deterministic planner.`,
          fallbackAvailable: true,
        },
      },
      { "Retry-After": String(rl.retryAfterSeconds) },
    );
  }

  try {
    const schedule = await generateSchedule(fixed, activities, getScheduler());
    return Response.json({ schedule });
  } catch (err) {
    const e = err instanceof AiProviderError ? err : classifyProviderError(err);
    const cause = e.cause instanceof Error ? e.cause.message : e.cause;
    console.error("[generate] AI error:", e.code, cause ?? e.message);
    const status = e.code === "rate_limited" || e.code === "quota_exceeded" ? 429 : e.code === "not_configured" ? 503 : 502;
    return fail(status, { error: { code: e.code, message: e.message, fallbackAvailable: true } });
  }
}
