import { spawn } from "node:child_process";
import { env } from "@/lib/env";
import { budgetExhaustedMessage, dbBudget } from "@/lib/ai/budget";

/**
 * Voice note → text + language (see .claude/skills/speech-whisper/SKILL.md).
 * groq (default): POST /openai/v1/audio/transcriptions, verbose_json, no `language` so Whisper detects it.
 *   Live response (2026-11-07): { task, language: "English", duration, text, segments, x_groq }.
 * local (optional): faster-whisper through scripts/whisper_local.py.
 * Transcripts are PRIVATE: stored like message_text, never public, never logged.
 */
export const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const AUDIO_TYPES = ["audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg", "audio/webm", "audio/flac"];
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

export type Transcript = { text: string; language: string; durationSec: number | null; provider: "groq" | "local" };

/** Whisper language names → ISO 639-1 (the ones we expect; anything else is lower-cased as is). */
const ISO: Record<string, string> = {
  english: "en", hindi: "hi", spanish: "es", french: "fr", german: "de", portuguese: "pt", arabic: "ar", bengali: "bn",
  urdu: "ur", tamil: "ta", telugu: "te", marathi: "mr", gujarati: "gu", punjabi: "pa", nepali: "ne", chinese: "zh",
  japanese: "ja", korean: "ko", indonesian: "id", vietnamese: "vi", tagalog: "tl", swahili: "sw", italian: "it", russian: "ru",
};

/** Pure (tested). */
export function toIso639(lang: string | null | undefined): string {
  const l = (lang ?? "").trim().toLowerCase();
  if (!l) return "und";
  if (/^[a-z]{2}$/.test(l)) return l;
  return ISO[l] ?? l.slice(0, 16);
}

/** Pure (tested): Groq verbose_json → Transcript. */
export function parseGroqTranscript(j: unknown): Transcript {
  const o = (j ?? {}) as { text?: unknown; language?: unknown; duration?: unknown };
  if (typeof o.text !== "string") throw new Error("transcription response has no text");
  return {
    text: o.text.trim(),
    language: toIso639(typeof o.language === "string" ? o.language : null),
    durationSec: typeof o.duration === "number" ? Math.round(o.duration * 10) / 10 : null,
    provider: "groq",
  };
}

const extFor = (mime: string) => (/wav/.test(mime) ? "wav" : /mpeg|mp3/.test(mime) ? "mp3" : /mp4|m4a/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : /webm/.test(mime) ? "webm" : /flac/.test(mime) ? "flac" : "wav");

async function transcribeGroq(bytes: Uint8Array, mime: string): Promise<Transcript> {
  const e = env();
  if (!e.GROQ_API_KEY) throw new Error("disabled: no key (GROQ_API_KEY): voice note not transcribed");
  // Whisper counts against the Groq daily budget (lib/ai/budget.ts).
  if (!(await dbBudget.reserve("groq"))) throw new Error(`groq whisper: ${budgetExhaustedMessage("groq")}`);
  const form = new FormData();
  form.set("file", new Blob([Buffer.from(bytes)], { type: mime }), `voice.${extFor(mime)}`);
  form.set("model", e.GROQ_WHISPER_MODEL);
  form.set("response_format", "verbose_json");
  form.set("temperature", "0");
  const res = await fetch(GROQ_TRANSCRIBE_URL, { method: "POST", headers: { Authorization: `Bearer ${e.GROQ_API_KEY}` }, body: form, signal: AbortSignal.timeout(60_000) });
  const j = (await res.json().catch(() => undefined)) as { error?: { message?: string; code?: string } } | undefined;
  if (!res.ok) throw new Error(`groq whisper HTTP ${res.status} ${j?.error?.code ?? ""}`.trim());
  return parseGroqTranscript(j);
}

/** Local faster-whisper: python scripts/whisper_local.py <model> reads audio on stdin, prints JSON. Optional. */
async function transcribeLocal(bytes: Uint8Array): Promise<Transcript> {
  const out = await new Promise<string>((resolve, reject) => {
    // turbopackIgnore: optional local mode only; keeps Next from tracing the whole repo into the server bundle.
    const p = spawn(/*turbopackIgnore: true*/ process.env.PYTHON ?? "python", ["scripts/whisper_local.py", env().WHISPER_LOCAL_MODEL], { stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    p.stdout.on("data", (d) => (buf += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`local whisper exited ${code}`))));
    p.stdin.end(Buffer.from(bytes));
  });
  const j = JSON.parse(out) as { text: string; language: string; duration: number };
  return { text: j.text.trim(), language: toIso639(j.language), durationSec: j.duration ?? null, provider: "local" };
}

export async function transcribe(audio: { bytes: Uint8Array; mimeType: string }): Promise<Transcript> {
  return env().WHISPER_MODE === "local" ? transcribeLocal(audio.bytes) : transcribeGroq(audio.bytes, audio.mimeType);
}
