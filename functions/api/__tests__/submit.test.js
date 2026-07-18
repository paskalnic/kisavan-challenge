import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return {
    ...actual,
    supabaseRequest: vi.fn(),
    randomAlias: vi.fn(() => "Colibri-123")
  };
});

import { onRequestPost } from "../submit.js";
import { supabaseRequest } from "../../_common.js";

describe("submit API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 and stores an attempt for valid answers", async () => {
    supabaseRequest
      .mockResolvedValueOnce([
        { id: "q1", correct_index: 1 },
        { id: "q2", correct_index: 0 }
      ])
      .mockResolvedValueOnce([{ id: "attempt-1" }])
      .mockResolvedValueOnce([]);

    const body = {
      quizId: "123e4567-e89b-12d3-a456-426614174000",
      answers: [
        { questionId: "q1", choiceIndex: 1 },
        { questionId: "q2", choiceIndex: 0 }
      ],
      durationMs: 42000
    };

    const request = new Request("https://example.com/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(201);

    const result = await response.json();
    expect(result).toEqual(
      expect.objectContaining({
        attemptId: "attempt-1",
        attemptToken: expect.any(String),
        alias: "Colibri-123",
        score: 2,
        total: 2,
        durationMs: 42000
      })
    );
  });

  it("returns 400 for invalid quizId", async () => {
    const request = new Request("https://example.com/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: "bad-id", answers: [], durationMs: 1000 })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(400);

    const result = await response.json();
    expect(result.error).toBe("Quiz invalide.");
  });

  it("calls supabaseRequest with the correct paths and env for submit", async () => {
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "secret"
    };

    supabaseRequest
      .mockResolvedValueOnce([
        { id: "q1", correct_index: 1 },
        { id: "q2", correct_index: 0 }
      ])
      .mockResolvedValueOnce([{ id: "attempt-1" }])
      .mockResolvedValueOnce([]);

    const body = {
      quizId: "123e4567-e89b-12d3-a456-426614174000",
      answers: [
        { questionId: "q1", choiceIndex: 1 },
        { questionId: "q2", choiceIndex: 0 }
      ],
      durationMs: 42000
    };

    const request = new Request("https://example.com/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    await onRequestPost({ request, env });

    expect(supabaseRequest).toHaveBeenNthCalledWith(
      1,
      env,
      `questions?quiz_id=eq.${body.quizId}&select=id,correct_index`
    );
    expect(supabaseRequest).toHaveBeenNthCalledWith(
      2,
      env,
      "attempts?select=id",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Prefer: "return=representation" }),
        body: expect.any(String)
      })
    );
    expect(supabaseRequest).toHaveBeenNthCalledWith(
      3,
      env,
      "attempt_answers",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String)
      })
    );
  });
});
