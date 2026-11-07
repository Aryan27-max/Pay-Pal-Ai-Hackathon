import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Privacy helpers. Everything that leaves the server for a public surface
 * (dashboard, receipt, chain) must go through this module.
 * See .claude/skills/privacy-guard/SKILL.md.
 */

/** Grid step in degrees. 0.1° of latitude ≈ 11.1 km, so cells are "about 10 km". */
export const GEO_CELL_DEG = 0.1;

const normEmail = (email: string) => email.trim().toLowerCase();

/** HMAC-SHA256(salt, value) as hex. */
export function hmacHex(salt: string, value: string): string {
  if (!salt || salt.length < 32) throw new Error("salt must be at least 32 chars");
  return createHmac("sha256", salt).update(value, "utf8").digest("hex");
}

/**
 * Public claim id = HMAC(CLAIM_ID_SALT, paypal_email), shortened for display (80 bits).
 * A repeat claim from the same account (seq ≥ 1) hashes "email#seq" so it can still be
 * stored — and rejected as a duplicate — without colliding with the first claim's id.
 */
export function claimPublicId(salt: string, paypalEmail: string, seq = 0): string {
  const input = seq === 0 ? `claim:${normEmail(paypalEmail)}` : `claim:${normEmail(paypalEmail)}#${seq}`;
  return `c_${hmacHex(salt, input).slice(0, 20)}`;
}

/** Public donor id = HMAC of PayPal payer id (or email if no payer id). Never stores the email. */
export function donorPublicId(salt: string, payerIdOrEmail: string): string {
  return `d_${hmacHex(salt, `donor:${payerIdOrEmail.trim().toLowerCase()}`).slice(0, 20)}`;
}

/** Reviewer anonymous id derived from the token, for the trail. */
export function reviewerPublicId(salt: string, reviewerToken: string): string {
  return `r_${hmacHex(salt, `reviewer:${reviewerToken}`).slice(0, 12)}`;
}

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Snap a coordinate to the ~10 km grid (cell centre). */
export function roundGeo(lat: number, lon: number): { lat: number; lon: number } {
  const snap = (v: number) => Number((Math.floor(v / GEO_CELL_DEG) * GEO_CELL_DEG + GEO_CELL_DEG / 2).toFixed(2));
  return { lat: snap(lat), lon: snap(lon) };
}

/** Public geo cell label, e.g. "38.75,-90.45". */
export function geoCell(lat: number, lon: number): string {
  const r = roundGeo(lat, lon);
  return `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Constant-time string compare for tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Mask an email for private/admin display: "ro***@example.com". */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = normEmail(email).split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

/** The only claim shape allowed on public surfaces. */
export type PublicClaim = {
  claimPublicId: string;
  geoCell: string;
  disasterEventId: string | null;
  status: string;
  score: number | null;
  createdAt: string;
};

export function redactClaim(c: {
  claimPublicId: string;
  geoCell: string;
  disasterEventId: string | null;
  status: string;
  score: number | null;
  createdAt: Date;
}): PublicClaim {
  return {
    claimPublicId: c.claimPublicId,
    geoCell: c.geoCell,
    disasterEventId: c.disasterEventId,
    status: c.status,
    score: c.score,
    createdAt: c.createdAt.toISOString(),
  };
}
