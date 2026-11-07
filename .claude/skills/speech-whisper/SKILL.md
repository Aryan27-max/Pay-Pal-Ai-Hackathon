---
name: speech-whisper
description: Use for voice notes — lib/speech transcription with Groq Whisper (default, free tier) or local faster-whisper, language detection, and feeding the transcript into the single AI call.
---

# speech-whisper

## Purpose

A claimant can send a voice note instead of (or with) text. `lib/speech` turns it into text + a language
code. The transcript joins the typed message in the **same single AI call** (no extra LLM call).
Transcripts are private: stored like `message_text`, never public, never on-chain.

## Files it owns

- `lib/speech/index.ts` — `transcribe(audio)` → `{ text, language, durationSec, provider }`
- `simulators/fixtures/audio/` — voice fixtures (see README there for what to record)
- `app/api/claims/route.ts` — optional multipart field `audio`

## Env vars

`WHISPER_MODE` (`groq` default | `local`), `GROQ_API_KEY`, `GROQ_WHISPER_MODEL` (`whisper-large-v3-turbo`),
`WHISPER_LOCAL_MODEL` (faster-whisper size, local mode only).

## How to

Groq (console.groq.com/docs/speech-to-text): `POST https://api.groq.com/openai/v1/audio/transcriptions`,
multipart fields `file`, `model`, `response_format=verbose_json`, `temperature=0`; omit `language` so
Whisper detects it. Read `text` and `language` from the JSON.
```ts
const form = new FormData();
form.set("file", new Blob([bytes], { type: mime }), "voice.m4a");
form.set("model", GROQ_WHISPER_MODEL); form.set("response_format", "verbose_json"); form.set("temperature", "0");
await fetch(URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
```
The docs show no full response example; `text`, `language` and `duration` were confirmed with a live call
(see the test below). verbose_json returns the language **name** (e.g. "hindi"); map it to ISO 639-1.

Local: `faster-whisper` via a Python subprocess (`WHISPER_MODE=local`). Optional; not used on Render.

## Limits (free tier)

- Files: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm; max 25 MB; min billed length **10 s** (a 4 s
  clip counts as 10 s). The rate-limit page lists 20 RPM, 2K RPD, 7.2K audio-seconds/hour,
  28.8K/day for both Whisper models; the page does not say which plan those are for (TODO: confirm).
- `whisper-large-v3-turbo` transcribes but does not translate; we never translate (Gemini reads Hindi).

## Gotchas

- Keep clips < 30 s (API cap in the route: 3 MB).
- Transcription failure is not fatal: the claim continues with the typed text; if there is no text at
  all, the message signal is 0 and a red flag says the voice note could not be read.
- Never log the transcript. The AI prompt gets it inside the claimant-message block, marked as a transcript.

## Test

- `tests/speech.test.ts`: response parsing + language-name → ISO mapping (mocked fetch).
- Live: `npx tsx scripts/speech-smoke.ts simulators/fixtures/audio/fake-contradictory-voice.wav` prints
  language + character count (not the text).
