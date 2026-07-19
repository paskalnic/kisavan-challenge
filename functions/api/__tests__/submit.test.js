import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return {
    ...actual,
    supabaseRequest: vi.fn(),
    randomAlias: vi.fn(() => "Colibri-123")
  };
});

import { buildDiagnosticTexts, onRequestPost } from "../submit.js";
import { supabaseRequest } from "../../_common.js";

const QUIZ_ID = "123e4567-e89b-12d3-a456-426614174000";

const questions = [
  { id: "q1", correct_index: 1, choices: ["A", "B"], skill_code: "lecture", skill_label: "Lecture" },
  { id: "q2", correct_index: 0, choices: ["A", "B"], skill_code: "lecture", skill_label: "Lecture" },
  { id: "q3", correct_index: 1, choices: ["A", "B"], skill_code: "accords", skill_label: "Accords" },
  { id: "q4", correct_index: 0, choices: ["A", "B"], skill_code: "accords", skill_label: "Accords" }
];

function makeRequest(answers) {
  return new Request("https://example.com/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quizId: QUIZ_ID, answers, durationMs: 42000, sessionId: "session-1", ctaVariant: "A" })
  });
}

describe("submit API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a validated attempt and a diagnostic by skill", async () => {
    supabaseRequest
      .mockResolvedValueOnce(questions)
      .mockResolvedValueOnce([{ id: "attempt-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await onRequestPost({
      request: makeRequest([
        { questionId: "q1", choiceIndex: 1 },
        { questionId: "q2", choiceIndex: 1 },
        { questionId: "q3", choiceIndex: 1 },
        { questionId: "q4", choiceIndex: 0 }
      ]),
      env: {}
    });

    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.score).toBe(3);
    expect(result.skillSummary).toEqual([
      { code: "lecture", label: "Lecture", correct: 1, total: 2, percentage: 50 },
      { code: "accords", label: "Accords", correct: 2, total: 2, percentage: 100 }
    ]);

    const attempt = JSON.parse(supabaseRequest.mock.calls[1][2].body);
    expect(attempt.skill_summary).toEqual(result.skillSummary);
    expect(attempt.strengths_text).toBe("Points d'appui : accords.");
    expect(attempt.work_priorities_text).toBe("Priorités de travail : lecture.");
    expect(attempt.diagnostic_text).toContain("bons acquis en accords");
    expect(result.diagnosticText).toBe(attempt.diagnostic_text);
  });

  it("generates a reassuring diagnostic when all skills are mastered", () => {
    expect(buildDiagnosticTexts([
      { code: "lecture", label: "Lecture", correct: 2, total: 2, percentage: 100 },
      { code: "accords", label: "Accords", correct: 2, total: 2, percentage: 100 }
    ])).toEqual({
      strengthsText: "Points d'appui : accords et lecture.",
      workPrioritiesText: "Aucune difficulté prioritaire ne ressort de ce quiz ; il convient de maintenir les acquis par un entraînement régulier.",
      diagnosticText: "L'élève maîtrise solidement les compétences évaluées. Un entraînement régulier permettra de maintenir ces acquis et de gagner encore en aisance."
    });
  });

  it("rejects incomplete, duplicate or out-of-range answers", async () => {
    supabaseRequest.mockResolvedValueOnce(questions);

    const response = await onRequestPost({
      request: makeRequest([
        { questionId: "q1", choiceIndex: 1 },
        { questionId: "q1", choiceIndex: 0 }
      ]),
      env: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Toutes les réponses doivent être valides et uniques."
    });
  });

  it("uses the enriched question query and records the funnel completion", async () => {
    const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret" };
    supabaseRequest
      .mockResolvedValueOnce(questions)
      .mockResolvedValueOnce([{ id: "attempt-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await onRequestPost({
      request: makeRequest(questions.map((question) => ({ questionId: question.id, choiceIndex: question.correct_index }))),
      env
    });

    expect(supabaseRequest).toHaveBeenNthCalledWith(
      1,
      env,
      `questions?quiz_id=eq.${QUIZ_ID}&select=id,correct_index,choices,skill_code,skill_label`
    );
    expect(supabaseRequest.mock.calls[3][1]).toBe("funnel_events");
    const event = JSON.parse(supabaseRequest.mock.calls[3][2].body);
    expect(event.event_name).toBe("quiz_completed");
    expect(event.cta_variant).toBe("A");
  });
});
