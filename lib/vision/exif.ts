import exifr from "exifr";

/**
 * EXIF capture time + GPS (exifr). Missing EXIF is normal (messaging apps strip it) and is NOT a fail:
 * lib/scoring.exifFactor turns this into a confidence factor. Never stored or sent anywhere.
 */
export type ExifInfo = { present: boolean; takenAt?: Date; gps?: { lat: number; lon: number } };

export async function readExif(bytes: Uint8Array): Promise<ExifInfo> {
  try {
    const e = (await exifr.parse(Buffer.from(bytes), {
      pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLongitude", "latitude", "longitude"],
      gps: true,
    })) as { DateTimeOriginal?: Date; CreateDate?: Date; latitude?: number; longitude?: number } | undefined;
    if (!e) return { present: false };
    const takenAt = e.DateTimeOriginal ?? e.CreateDate;
    const gps = typeof e.latitude === "number" && typeof e.longitude === "number" ? { lat: e.latitude, lon: e.longitude } : undefined;
    const info: ExifInfo = { present: Boolean(takenAt || gps) };
    if (takenAt instanceof Date && !Number.isNaN(takenAt.getTime())) info.takenAt = takenAt;
    if (gps) info.gps = gps;
    return info;
  } catch {
    return { present: false };
  }
}
