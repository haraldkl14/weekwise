import { AiErrorCode, AiProviderError } from "./scheduler";

const MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "The AI is not configured on the server (missing GEMINI_API_KEY or GEMINI_MODEL).",
  invalid_key: "The Gemini API key was rejected. Check GEMINI_API_KEY in .env.local.",
  rate_limited: "Gemini is rate-limiting requests right now. Wait a minute and try again.",
  quota_exceeded: "The Gemini API quota for this key is used up.",
  unavailable: "Gemini is temporarily unavailable.",
  bad_response: "Gemini returned a response that could not be read.",
  unknown: "The AI request failed unexpectedly.",
};

export function userMessage(code: AiErrorCode): string {
  return MESSAGES[code];
}

/** Map any thrown value from a provider SDK to an AiProviderError. */
export function classifyProviderError(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("api key not valid") || lower.includes("api_key_invalid") || status === 401 || status === 403) {
    return new AiProviderError("invalid_key", MESSAGES.invalid_key);
  }
  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("quota")) {
    // Gemini uses 429 for both; a hard quota mentions it explicitly.
    const quota = lower.includes("exceeded your current quota") || lower.includes("billing") || lower.includes("per day");
    return new AiProviderError(quota ? "quota_exceeded" : "rate_limited", quota ? MESSAGES.quota_exceeded : MESSAGES.rate_limited);
  }
  if (status === 404 || (lower.includes("model") && lower.includes("not found"))) {
    return new AiProviderError("not_configured", "The model in GEMINI_MODEL was not found. Check the model name.");
  }
  if ((status !== undefined && status >= 500) || lower.includes("fetch failed") || lower.includes("timeout")) {
    return new AiProviderError("unavailable", MESSAGES.unavailable);
  }
  return new AiProviderError("unknown", MESSAGES.unknown);
}
