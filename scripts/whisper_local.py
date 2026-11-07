"""Optional local Whisper (WHISPER_MODE=local): pip install faster-whisper.
Reads audio bytes on stdin, prints {"text", "language", "duration"} as JSON. Never prints anything else.
"""
import io
import json
import sys

from faster_whisper import WhisperModel  # type: ignore

model_size = sys.argv[1] if len(sys.argv) > 1 else "base"
model = WhisperModel(model_size, device="cpu", compute_type="int8")
segments, info = model.transcribe(io.BytesIO(sys.stdin.buffer.read()), temperature=0)
text = " ".join(s.text.strip() for s in segments)
print(json.dumps({"text": text, "language": info.language, "duration": info.duration}))
