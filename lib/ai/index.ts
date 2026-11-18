import "server-only";
import { AiProviderError, AiScheduler } from "./scheduler";
import { GeminiScheduler } from "./gemini";

/** Single place to choose the provider. */
export function getScheduler(): AiScheduler {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!key || !model || key === "your-gemini-api-key") {
    throw new AiProviderError("not_configured", "The AI is not configured on the server (set GEMINI_API_KEY and GEMINI_MODEL in .env.local).");
  }
  return new GeminiScheduler(key, model);
}
