import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { DAY_SHORT } from "../types";
import { AiProposal, AiProviderError, AiScheduleRequest, AiScheduler } from "./scheduler";
import { buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt";
import { classifyProviderError } from "./errors";

function responseSchema(activityIds: string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      placements: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            activity: { type: Type.STRING, enum: activityIds, description: "Activity id" },
            day: { type: Type.STRING, enum: [...DAY_SHORT] },
            start: { type: Type.STRING, description: "HH:MM, 15-minute boundary" },
            end: { type: Type.STRING, description: "HH:MM, 15-minute boundary, after start, same day" },
          },
          required: ["activity", "day", "start", "end"],
          propertyOrdering: ["activity", "day", "start", "end"],
        },
      },
      explanation: { type: Type.STRING, description: "2–4 sentences explaining the choices" },
    },
    required: ["placements", "explanation"],
    propertyOrdering: ["placements", "explanation"],
  };
}

export class GeminiScheduler implements AiScheduler {
  readonly name = "gemini";
  private client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async propose(request: AiScheduleRequest): Promise<AiProposal> {
    let text: string | undefined;
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: buildUserPrompt(request),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: responseSchema(request.activities.map((a) => a.id)),
          temperature: 0.2,
        },
      });
      text = res.text;
    } catch (err) {
      throw classifyProviderError(err);
    }
    if (!text) throw new AiProviderError("bad_response", "Empty response from Gemini");
    try {
      const parsed = JSON.parse(text) as AiProposal;
      if (!Array.isArray(parsed.placements)) throw new Error("placements missing");
      return { placements: parsed.placements, explanation: String(parsed.explanation ?? "") };
    } catch {
      throw new AiProviderError("bad_response", "Gemini returned invalid JSON");
    }
  }
}
