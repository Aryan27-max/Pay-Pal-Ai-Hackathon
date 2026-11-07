# Fixture photo credits

All photos are **public domain** works from Wikimedia Commons (US federal government works, or AI output marked public domain), or derived from them by us. Downscaled to at most 1280 px; metadata stripped by re-encoding.

| File | Source | Author / agency |
| --- | --- | --- |
| genuine-1.jpg | File:FEMA - 34508 - Flooded street in Missouri.jpg | Jocelyn Augustino / FEMA |
| genuine-2.jpg | File:FEMA - 35728 - Residents in Iowa begin to clean up after flooding.jpg | Greg Henshall / FEMA |
| genuine-3.jpg | File:FEMA - 34478 - Homes and business surrounded by water in Missouri.jpg (Dutchtown, MO, 2008) | Jocelyn Augustino / FEMA |
| borderline-outside-zone.jpg | File:Katrina NOLA levee break FEMA.jpg | FEMA |
| borderline-no-damage.jpg | File:Houses in New Augusta, Indianapolis.jpg | Public domain (Wikimedia Commons) |
| fake-duplicate-account.jpg | File:FEMA - 3629 - Photograph by Leif Skoogfors taken on 07-17-2001 in West Virginia.jpg | Leif Skoogfors / FEMA |
| fake-cropped-photo.jpg | Derived from genuine-1.jpg by `scripts/make-fake-photos.ts` (crop 82% × 85%, JPEG quality 62) | (derivative of the FEMA photo above) |
| fake-heavy-edit.jpg | Derived from genuine-1.jpg by `scripts/make-fake-photos.ts` (crop 75% × 78%, resize to 640 px, brightness ×1.2, JPEG quality 70) | (derivative of the FEMA photo above) |
| fake-ai-generated.jpg | File:Largely abandoned cyberpunk city with not enough funds to protect against the rising sea (v2).png | AI-generated (weights.com), public domain: "the work of a computer algorithm or artificial intelligence" (PD-algorithm) |
| fake-outside-zone.jpg | File:FEMA - 34577 - Flooded neighborhood in rural Missouri.jpg (Dutchtown, MO, 2008) | John Shea / FEMA |
| fake-contradictory-voice.jpg | File:FEMA - 34505 - Home in Missouri continuing to be surrounded by flood waters.jpg (Pacific, MO, 2008) | Jocelyn Augustino / FEMA |

The "reused photo" fake deliberately re-submits `genuine-1.jpg` under a different PayPal account (caught by the SHA-256).
The "cropped photo" fake is the same scene with a different SHA-256, so only CLIP + Elastic can catch it.
The outside-zone and contradicting-voice fakes use genuine flood photos on purpose: they must be caught by the
location and message checks, not by the photo.

genuine-3.jpg was replaced on 2026-11-07: the earlier photo (Deltona, Florida, Hurricane Irma) shows palms and
Spanish moss, and Gemini rightly flagged it as not matching a Missouri River flood. A genuine fixture must be
genuinely consistent with its claim, so it now uses a Missouri flood photo (Wikimedia's 1280 px rendition).
