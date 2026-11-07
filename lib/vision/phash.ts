import sharp from "sharp";

/**
 * Perceptual difference hash (dHash, 64 bits), free and local (sharp). Second near-duplicate signal next to
 * CLIP: robust to resizing, re-compression and brightness/contrast changes (CLIP covers crops). Stored on the
 * claim as 16 hex chars; compared by Hamming distance in Postgres, so it works even with Elasticsearch off.
 */
export async function dHash(bytes: Uint8Array): Promise<string> {
  // 9×8 grayscale: each bit = is this pixel brighter than its right neighbour.
  const px = await sharp(Buffer.from(bytes)).rotate().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) byte = (byte << 1) | (px[row * 9 + col]! > px[row * 9 + col + 1]! ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Number of differing bits between two 64-bit hex hashes (0 = identical, 64 = opposite). */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}
