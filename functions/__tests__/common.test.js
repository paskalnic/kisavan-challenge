import { describe, it, expect, vi } from "vitest";
import { randomAlias, validUuid, supabaseRequest } from "../_common.js";

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

  it("supabaseRequest throws when SUPABASE_URL is missing", async () => {
    await expect(supabaseRequest({}, "quizzes")).rejects.toThrow("Configuration Supabase manquante.");
  });

  it("supabaseRequest builds a valid URL when SUPABASE_URL is present", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([{ id: 1 }])
    });

    const env = {
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_SECRET_KEY: "secret"
    };

    const data = await supabaseRequest(env, "/quizzes");
    expect(fetch).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/quizzes",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "secret",
          Authorization: "Bearer secret"
        })
      })
    );
    expect(data).toEqual([{ id: 1 }]);
  });
});
