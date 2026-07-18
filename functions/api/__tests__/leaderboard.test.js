import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return {
    ...actual,
    supabaseRequest: vi.fn()
  };
});

import { onRequestGet } from "../leaderboard.js";
import { supabaseRequest } from "../../_common.js";

describe("leaderboard API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ordered leaderboard entries", async () => {
    supabaseRequest.mockResolvedValueOnce([
      { alias: "Colibri-123", score: 5, total: 5, duration_ms: 23000 },
      { alias: "Dauphin-007", score: 4, total: 5, duration_ms: 20000 }
    ]);

    const request = new Request("https://example.com/api/leaderboard?quizId=123e4567-e89b-12d3-a456-426614174000");
    const response = await onRequestGet({ request, env: {} });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.entries).toEqual([
      { alias: "Colibri-123", score: 5, total: 5, duration_seconds: 23 },
      { alias: "Dauphin-007", score: 4, total: 5, duration_seconds: 20 }
    ]);
  });

  it("returns 400 for invalid quizId", async () => {
    const request = new Request("https://example.com/api/leaderboard?quizId=bad-id");
    const response = await onRequestGet({ request, env: {} });
    expect(response.status).toBe(400);
  });
});
