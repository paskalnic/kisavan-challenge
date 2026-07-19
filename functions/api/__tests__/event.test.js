import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return { ...actual, supabaseRequest: vi.fn() };
});

import { onRequestPost } from "../event.js";
import { supabaseRequest } from "../../_common.js";

const QUIZ_ID = "123e4567-e89b-12d3-a456-426614174000";

function request(body) {
  return new Request("https://example.com/api/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("funnel event API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores only whitelisted events", async () => {
    supabaseRequest.mockResolvedValueOnce([]);
    const response = await onRequestPost({
      request: request({
        eventName: "quiz_started",
        quizId: QUIZ_ID,
        sessionId: "session-1",
        ctaVariant: "A",
        metadata: { source: "home" }
      }),
      env: {}
    });

    expect(response.status).toBe(201);
    const event = JSON.parse(supabaseRequest.mock.calls[0][2].body);
    expect(event.event_name).toBe("quiz_started");
    expect(event.metadata).toEqual({ source: "home" });
  });

  it("rejects arbitrary event names", async () => {
    const response = await onRequestPost({ request: request({ eventName: "customer_converted" }), env: {} });
    expect(response.status).toBe(400);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });
});
