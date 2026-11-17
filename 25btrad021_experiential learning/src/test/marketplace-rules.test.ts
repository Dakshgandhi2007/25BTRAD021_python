import { describe, expect, it } from "vitest";

import { clampRentalDays, LISTING_PHOTO_TYPES, MAX_LISTING_PHOTO_BYTES, rentalTotal } from "@/lib/marketplace-rules";

describe("marketplace rental rules", () => {
  it("keeps rental requests between one and 30 days", () => {
    expect(clampRentalDays(0)).toBe(1);
    expect(clampRentalDays(31)).toBe(30);
  });

  it("calculates the total from the daily price and accepted days", () => {
    expect(rentalTotal(125, 4)).toBe(500);
    expect(rentalTotal(125, 99)).toBe(3750);
  });

  it("limits listing photos to the supported image formats and 3 MB", () => {
    expect(LISTING_PHOTO_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(MAX_LISTING_PHOTO_BYTES).toBe(3 * 1024 * 1024);
  });
});