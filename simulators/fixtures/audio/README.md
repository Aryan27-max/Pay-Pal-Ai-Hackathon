# Voice-note fixtures

Voice notes go through Groq Whisper (`lib/speech`), and the transcript joins the single AI call.
Transcripts are private: they are never shown publicly or written on-chain.

| File (any of .m4a .mp3 .wav .ogg .webm) | Claim | Status |
| --- | --- | --- |
| `genuine-1-en` | genuine-1 (English) | **record it** |
| `genuine-3-hi` | genuine-3 (Hindi) | **record it** |
| `fake-contradictory-voice.wav` | fake: story contradicts the photo and the event | made with Windows text-to-speech (self-made) |

Until a clip exists, the simulator sends that claim's `fallbackMessage` as typed text and says so.

## How to record (phone or laptop, 10–20 seconds each)

- Quiet room, normal voice, about 15 cm from the mic. Say it like a person telling a helpline what happened,
  not like reading. Small pauses are fine.
- Keep it under 20 seconds (the API accepts up to 3 MB; Groq bills a minimum of 10 s per clip).
- Your own voice only, no music, no other people's names. These are demo fixtures: invent the details.
- Save the files exactly as `simulators/fixtures/audio/genuine-1-en.m4a` and
  `simulators/fixtures/audio/genuine-3-hi.m4a` (a phone voice memo is usually .m4a; .mp3/.wav/.ogg also work).

### genuine-1-en (English, about 15 s)

> "Hi, this is about the flood in St. Charles. On Tuesday night the Missouri came over the levee near our street.
> About two feet of water got into our ground floor and ruined the fridge, the mattresses and the kids' clothes.
> We're staying at my sister's place, and we need money for food and to rent a pump."

### genuine-3-hi (Hindi, about 15 s)

> "नमस्ते। मैं सेंट चार्ल्स काउंटी में रहता हूँ। मिसौरी नदी की बाढ़ का पानी अभी भी हमारे आँगन में भरा है और नीचे का हिस्सा पूरा डूब गया है।
> बुधवार से बिजली नहीं है और भट्टी भी पानी में डूब गई। पानी उतरने तक हमें हीटर और खाने के लिए मदद चाहिए।"

(Romanised, if that is easier to read aloud: "Namaste. Main St. Charles County mein rehta hoon. Missouri nadi ki baadh
ka paani abhi bhi hamare aangan mein bhara hai aur neeche ka hissa poora doob gaya hai. Budhvaar se bijli nahin hai
aur bhatti bhi paani mein doob gayi. Paani utarne tak hamein heater aur khaane ke liye madad chahiye.")

### fake-contradictory-voice (already here)

English TTS: an earthquake in Kathmandu, Nepal, while the claim's photo and GPS are a Missouri flood. The message
check must flag it (`message:contradicts_event`) so the claim is never auto-paid.

After adding clips, run `npm run sim:demo`: the first run makes one Whisper call per clip and one AI call per
claim; later runs reuse the demo cache for the AI (Whisper still runs, 3 short clips per run).
