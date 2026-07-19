import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return { ...actual, supabaseRequest: vi.fn() };
});

import { onRequestGet } from "../shared-result.js";
import { supabaseRequest } from "../../_common.js";

const ATTEMPT_ID = "123e4567-e89b-12d3-a456-426614174000";
const QUIZ_ID = "123e4567-e89b-12d3-a456-426614174001";
const SHARE_TOKEN = "123e4567-e89b-12d3-a456-426614174002";
const SHARE_ID = "123e4567-e89b-12d3-a456-426614174003";
const diagnostic = { strengths_text: "Points d’appui.", work_priorities_text: "Priorités.", diagnostic_text: "Bilan rédigé." };
const skillSummary = [{ code: "lecture", label: "Lecture", correct: 2, total: 2, percentage: 100 }];

describe("shared result API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the private result with its skill summary and tracks the opening", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: SHARE_ID, attempt_id: ATTEMPT_ID, open_count: 2 }])
      .mockResolvedValueOnce([{ id: ATTEMPT_ID, quiz_id: QUIZ_ID, alias: "Colibri-123", score: 4, total: 5, duration_ms: 32000, skill_summary: skillSummary, ...diagnostic }])
      .mockResolvedValueOnce([{ title: "Français", week_label: "Diagnostic", level: "5e", subject: "francais" }])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([]);

    const response = await onRequestGet({
      request: new Request(`https://example.com/api/shared-result?token=${SHARE_TOKEN}`),
      env: {}
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.skillSummary).toEqual(skillSummary);
    expect(body.result.quiz.subjectLabel).toBe("Français");
    expect(body.result.diagnosticText).toBe("Bilan rédigé.");
    expect(supabaseRequest.mock.calls[4][1]).toBe("funnel_events");
  });

  it("returns 404 for an unknown link", async () => {
    supabaseRequest.mockResolvedValueOnce([]);
    const response = await onRequestGet({ request: new Request(`https://example.com/api/shared-result?token=${SHARE_TOKEN}`), env: {} });
    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed token", async () => {
    const response = await onRequestGet({ request: new Request("https://example.com/api/shared-result?token=bad-token"), env: {} });
    expect(response.status).toBe(400);
  });
});
