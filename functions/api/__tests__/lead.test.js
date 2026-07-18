import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return {
    ...actual,
    supabaseRequest: vi.fn()
  };
});

import { onRequestPost } from "../lead.js";
import { supabaseRequest } from "../../_common.js";

describe("lead API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 when parent lead data is valid", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: "attempt-1" }])
      .mockResolvedValueOnce([]);

    const body = {
      attemptId: "123e4567-e89b-12d3-a456-426614174000",
      attemptToken: "123e4567-e89b-12d3-a456-426614174001",
      parentName: "Marie",
      parentEmail: "marie@example.com",
      parentPhone: "0600000000",
      postalCode: "75001",
      childLevel: "5e",
      mainDifficulty: "Calcul mental",
      callbackRequested: true,
      emailMarketingConsent: false
    };

    const request = new Request("https://example.com/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(201);

    const result = await response.json();
    expect(result.ok).toBe(true);
  });

  it("returns 400 when email is invalid", async () => {
    const request = new Request("https://example.com/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: "123e4567-e89b-12d3-a456-426614174000",
        attemptToken: "123e4567-e89b-12d3-a456-426614174001",
        parentName: "Marie",
        parentEmail: "bad-email"
      })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(400);

    const result = await response.json();
    expect(result.error).toBe("Adresse e-mail invalide.");
  });
});
