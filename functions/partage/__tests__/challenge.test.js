import { describe, expect, it } from "vitest";
import { onRequestGet } from "../challenge.js";

describe("challenge social preview route", () => {
  it("returns an attractive Open Graph preview and redirects to the quiz", async () => {
    const response = await onRequestGet({ request: new Request("https://example.com/partage/challenge") });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Peux-tu réussir le challenge français 5e ?");
    expect(html).toContain("https://example.com/assets/share-challenge.png");
    expect(html).toContain("/?source=share");
  });
});
