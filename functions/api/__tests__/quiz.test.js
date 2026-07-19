import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return { ...actual, supabaseRequest: vi.fn() };
});

import { onRequestGet } from "../quiz.js";
import { supabaseRequest } from "../../_common.js";

const SLUG = "francais-5e-diagnostic-v2";

describe("quiz API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the imposed quiz with diagnostic skill metadata", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: "quiz-1", title: "Quiz 1", week_label: "10 questions", slug: SLUG, level: "5e", subject: "francais" }])
      .mockResolvedValueOnce([{ id: "q1", prompt: "Question", choices: ["A", "B"], position: 1, skill_code: "lecture", skill_label: "Lecture" }]);

    const response = await onRequestGet({ request: new Request(`https://example.com/api/quiz?slug=${SLUG}`), env: {} });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.questions[0].skill_code).toBe("lecture");
  });

  it("returns 404 when no active quiz matches the slug", async () => {
    supabaseRequest.mockResolvedValueOnce([]);
    const response = await onRequestGet({ request: new Request(`https://example.com/api/quiz?slug=${SLUG}`), env: {} });
    expect(response.status).toBe(404);
  });

  it("queries the exact slug and skill columns", async () => {
    const env = { SUPABASE_URL: "https://example.supabase.co" };
    supabaseRequest
      .mockResolvedValueOnce([{ id: "quiz-1", title: "Quiz 1", week_label: "10 questions", slug: SLUG, level: "5e", subject: "francais" }])
      .mockResolvedValueOnce([]);

    await onRequestGet({ request: new Request(`https://example.com/api/quiz?slug=${SLUG}`), env });
    expect(supabaseRequest).toHaveBeenNthCalledWith(
      1,
      env,
      `quizzes?slug=eq.${SLUG}&active=eq.true&select=id,slug,title,week_label,level,subject&limit=1`
    );
    expect(supabaseRequest.mock.calls[1][1]).toContain("skill_code,skill_label");
  });
});
