import { describe, expect, it } from "vitest";
import { onRequestGet } from "../[token].js";

const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

describe("parent social preview route", () => {
  it("returns private Open Graph metadata and redirects browsers to the app", async () => {
    const response = await onRequestGet({
      request: new Request(`https://example.com/bilan/${TOKEN}`),
      params: { token: TOKEN }
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Un résultat Ki'Savan vous a été transmis");
    expect(html).toContain("https://example.com/assets/share-parent.png");
    expect(html).toContain(`/?bilan=${TOKEN}`);
  });

  it("rejects malformed tokens", async () => {
    const response = await onRequestGet({ request: new Request("https://example.com/bilan/bad"), params: { token: "bad" } });
    expect(response.status).toBe(400);
  });
});
