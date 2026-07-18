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
        { id: "quiz-1", title: "Quiz 1", week_label: "Semaine 1", level: "5e", subject: "maths" }
      ])
      .mockResolvedValueOnce([
        { id: "q1", prompt: "Quelle est la capitale ?", choices: ["A", "B"], position: 1 }
      ]);

    const request = new Request("https://example.com/api/quiz?level=5e&subject=maths");
    const response = await onRequestGet({ request, env: {} });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.quiz).toEqual(expect.objectContaining({ id: "quiz-1" }));
    expect(body.questions).toHaveLength(1);
  });

  it("returns 404 when no quiz is active", async () => {
    supabaseRequest.mockResolvedValueOnce([]);

    const request = new Request("https://example.com/api/quiz?level=5e&subject=maths");
    const response = await onRequestGet({ request, env: {} });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe("Aucun quiz actif pour ce niveau.");
  });

  it("calls supabaseRequest with the correct quizzes path", async () => {
    const env = { SUPABASE_URL: "https://example.supabase.co" };

    supabaseRequest
      .mockResolvedValueOnce([
        { id: "quiz-1", title: "Quiz 1", week_label: "Semaine 1", level: "5e", subject: "maths" }
      ])
      .mockResolvedValueOnce([]);

    const request = new Request("https://example.com/api/quiz?level=5e&subject=maths");
    await onRequestGet({ request, env });

    expect(supabaseRequest).toHaveBeenNthCalledWith(
      1,
      env,
      "quizzes?active=eq.true&level=eq.5e&subject=eq.maths&select=id,title,week_label,level,subject&limit=1"
    );
  });
});
