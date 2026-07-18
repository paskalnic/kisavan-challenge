import { describe, it, expect } from "vitest";
import { randomAlias, validUuid } from "../_common.js";

describe("common helpers", () => {
  it("validUuid returns true for a valid UUID", () => {
    expect(validUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("validUuid returns false for an invalid UUID", () => {
    expect(validUuid("not-a-uuid")).toBe(false);
  });

  it("randomAlias returns a human-friendly alias with a numeric suffix", () => {
    const alias = randomAlias();
    expect(alias).toMatch(/^[^\s-]+-\d{3}$/);
  });
});
