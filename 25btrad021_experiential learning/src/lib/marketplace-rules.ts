export function clampRentalDays(days: number) {
  if (!Number.isFinite(days)) return 1;
  return Math.min(Math.max(Math.trunc(days), 1), 30);
}

export function rentalTotal(dailyPrice: number, days: number) {
  return dailyPrice * clampRentalDays(days);
}

export const MAX_LISTING_PHOTO_BYTES = 3 * 1024 * 1024;
export const LISTING_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;