import { GoogleGenAI } from "@google/genai";
import { AI_ASSESSMENT_JSON_SCHEMA } from "./contract";

/**
 * The two vision providers behind lib/ai. Each takes the same prompt + photo and returns the raw
 * model text; lib/ai/index.ts validates it with the same zod contract and decides on fallback.
 * Neither ever sees the PayPal email, name, exact GPS or claim ids.
 */

export type ProviderName = "gemini" | "groq";

export type ProviderRequest = {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  photo: { bytes: Uint8Array; mimeType: string };
};

/** Returns raw model text. Throws on any HTTP / SDK error (message is classified by the caller). */
export type ProviderCall = (req: ProviderRequest) => Promise<string | undefined>;

/* ---------------- Gemini (@google/genai) ---------------- */

let geminiClient: GoogleGenAI | undefined;
export const GEMINI_TIMEOUT_MS = 45_000;

export const callGemini: ProviderCall = async (req) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  geminiClient ??= new GoogleGenAI({ apiKey });
  const res = await geminiClient.models.generateContent({
    model: req.model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: req.photo.mimeType, data: Buffer.from(req.photo.bytes).toString("base64") } },
          { text: req.userPrompt },
        ],
      },
    ],
    config: {
      systemInstruction: req.systemPrompt,
      responseMimeType: "application/json",
      responseJsonSchema: AI_ASSESSMENT_JSON_SCHEMA,
      temperature: 0,
      // The SDK sets no timeout by default; one call once hung for ~3.7 min on 2026-11-07.
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
    },
  });
  return res.text;
};

/* ---------------- Groq (OpenAI-compatible chat completions) ---------------- */

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
/** console.groq.com/docs/vision: "Maximum allowed size for a request containing an image ... is 20MB". */
export const GROQ_MAX_REQUEST_BYTES = 20 * 1024 * 1024;

/**
 * Request body per console.groq.com/docs/vision ("JSON Mode with Images"): one user message with a
 * `text` part and an `image_url` part holding a base64 data URL, plus response_format json_object.
 * The docs show no system message alongside images, so the instructions travel in the text part.
 * json_object (not strict json_schema) because our contract uses minimum/maximum; zod validates after.
 */
export function buildGroqBody(req: ProviderRequest): Record<string, unknown> {
  const dataUrl = `data:${req.photo.mimeType};base64,${Buffer.from(req.photo.bytes).toString("base64")}`;
  const schemaNote = `Respond with ONE JSON object only, matching this JSON Schema:\n${JSON.stringify(AI_ASSESSMENT_JSON_SCHEMA)}`;
  return {
    model: req.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${req.systemPrompt}\n\n${schemaNote}\n\n${req.userPrompt}` },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  };
}

/** Error text the shared classifier understands: `HTTP <code> | <type/code> | retry-after <n>s | <message>`. */
export function groqErrorText(status: number, body: unknown, retryAfter: string | null): string {
  const e = ((body ?? {}) as { error?: { message?: unknown; type?: unknown; code?: unknown } }).error ?? {};
  const kind = [e.type, e.code].filter((x) => typeof x === "string").join("/");
  const ra = retryAfter && /^\d+(\.\d+)?$/.test(retryAfter.trim()) ? `"retryDelay": "${retryAfter.trim()}s"` : "";
  const msg = typeof e.message === "string" ? e.message.slice(0, 160) : "";
  return [`groq "code": ${status}`, kind, ra, msg].filter(Boolean).join(" | ");
}

export const callGroq: ProviderCall = async (req) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  const body = JSON.stringify(buildGroqBody(req));
  if (Buffer.byteLength(body) > GROQ_MAX_REQUEST_BYTES) throw new Error("photo too large for the Groq request limit (20 MB)");
  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => undefined)) as
    | { choices?: Array<{ message?: { content?: string | null } }>; error?: unknown }
    | undefined;
  if (!res.ok) throw new Error(groqErrorText(res.status, json, res.headers.get("retry-after")));
  return json?.choices?.[0]?.message?.content ?? undefined;
};
