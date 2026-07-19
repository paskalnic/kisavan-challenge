import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return {
    ...actual,
    supabaseRequest: vi.fn()
  };
});

import { onRequestGet } from "../shared-result.js";
import { supabaseRequest } from "../../_common.js";

const ATTEMPT_ID = "123e4567-e89b-12d3-a456-426614174000";
const QUIZ_ID = "123e4567-e89b-12d3-a456-426614174001";
const SHARE_TOKEN = "123e4567-e89b-12d3-a456-426614174002";
const SHARE_ID = "123e4567-e89b-12d3-a456-426614174003";

describe("shared result API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the result connected to a valid parent link", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: SHARE_ID, attempt_id: ATTEMPT_ID, open_count: 2 }])
      .mockResolvedValueOnce([{
        id: ATTEMPT_ID,
        quiz_id: QUIZ_ID,
        alias: "Colibri-123",
        score: 4,
        total: 5,
        duration_ms: 32000
      }])
      .mockResolvedValueOnce([{
        title: "Fractions",
        week_label: "Semaine 1",
        level: "5e",
        subject: "maths"
      }])
      .mockResolvedValueOnce(null);

    const request = new Request(`https://example.com/api/shared-result?token=${SHARE_TOKEN}`);
    const response = await onRequestGet({ request, env: {} });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toEqual({
      attemptId: ATTEMPT_ID,
      alias: "Colibri-123",
      score: 4,
      total: 5,
      durationSeconds: 32,
      quiz: {
        title: "Fractions",
        weekLabel: "Semaine 1",
        level: "5e",
        subject: "maths",
        subjectLabel: "Mathématiques"
      }
    });
  });

  it("returns 404 for an unknown link", async () => {
    supabaseRequest.mockResolvedValueOnce([]);

    const request = new Request(`https://example.com/api/shared-result?token=${SHARE_TOKEN}`);
    const response = await onRequestGet({ request, env: {} });

    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed token", async () => {
    const request = new Request("https://example.com/api/shared-result?token=bad-token");
    const response = await onRequestGet({ request, env: {} });

    expect(response.status).toBe(400);
  });
});
