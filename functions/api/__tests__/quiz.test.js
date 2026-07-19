import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return {
    ...actual,
    supabaseRequest: vi.fn()
  };
});

import { onRequestGet } from "../quiz.js";
import { supabaseRequest } from "../../_common.js";

describe("quiz API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns quiz data when a matching quiz exists", async () => {
    supabaseRequest
      .mockResolvedValueOnce([
        { id: "quiz-1", title: "Quiz 1", week_label: "Semaine 1", slug: "francais-5e-diagnostic", level: "5e", subject: "francais" }
      ])
      .mockResolvedValueOnce([
        { id: "q1", prompt: "Quelle est la capitale ?", choices: ["A", "B"], position: 1 }
      ]);

    const request = new Request("https://example.com/api/quiz?slug=francais-5e-diagnostic");
    const response = await onRequestGet({ request, env: {} });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.quiz).toEqual(expect.objectContaining({ id: "quiz-1" }));
    expect(body.questions).toHaveLength(1);
  });

  it("returns 404 when no quiz is active", async () => {
    supabaseRequest.mockResolvedValueOnce([]);

    const request = new Request("https://example.com/api/quiz?slug=francais-5e-diagnostic");
    const response = await onRequestGet({ request, env: {} });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe("Ce quiz n'est pas disponible.");
  });

  it("calls supabaseRequest with the correct quizzes path", async () => {
    const env = { SUPABASE_URL: "https://example.supabase.co" };

    supabaseRequest
      .mockResolvedValueOnce([
        { id: "quiz-1", title: "Quiz 1", week_label: "Semaine 1", slug: "francais-5e-diagnostic", level: "5e", subject: "francais" }
      ])
      .mockResolvedValueOnce([]);

    const request = new Request("https://example.com/api/quiz?slug=francais-5e-diagnostic");
    await onRequestGet({ request, env });

    expect(supabaseRequest).toHaveBeenNthCalledWith(
      1,
      env,
      "quizzes?slug=eq.francais-5e-diagnostic&active=eq.true&select=id,slug,title,week_label,level,subject&limit=1"
    );
  });
});
