import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return { ...actual, supabaseRequest: vi.fn() };
});

import { onRequestPost } from "../lead.js";
import { supabaseRequest } from "../../_common.js";

const ATTEMPT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ATTEMPT_TOKEN = "123e4567-e89b-12d3-a456-426614174001";
const SHARE_TOKEN = "123e4567-e89b-12d3-a456-426614174002";
const SHARE_ID = "123e4567-e89b-12d3-a456-426614174003";
const QUIZ_ID = "123e4567-e89b-12d3-a456-426614174004";

function post(body) {
  return new Request("https://example.com/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("lead API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the short initial form without phone or postal code", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: ATTEMPT_ID, quiz_id: QUIZ_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await onRequestPost({
      request: post({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        parentName: "Marie",
        parentEmail: "marie@example.com",
        mainConcern: "confiance",
        emailMarketingConsent: false
      }),
      env: {}
    });

    expect(response.status).toBe(201);
    const lead = JSON.parse(supabaseRequest.mock.calls[1][2].body);
    expect(lead).toEqual(expect.objectContaining({
      attempt_id: ATTEMPT_ID,
      parent_name: "Marie",
      parent_email: "marie@example.com",
      main_concern: "confiance",
      lead_source: "direct_result"
    }));
    expect(lead).not.toHaveProperty("postal_code");
    expect(lead).not.toHaveProperty("parent_phone");
  });

  it("links a parent form opened from the private share", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: SHARE_ID, attempt_id: ATTEMPT_ID }])
      .mockResolvedValueOnce([{ id: ATTEMPT_ID, quiz_id: QUIZ_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await onRequestPost({
      request: post({ shareToken: SHARE_TOKEN, parentName: "Paul", parentEmail: "paul@example.com" }),
      env: {}
    });

    expect(response.status).toBe(201);
    const lead = JSON.parse(supabaseRequest.mock.calls[2][2].body);
    expect(lead.share_id).toBe(SHARE_ID);
    expect(lead.lead_source).toBe("parent_share");
  });

  it("validates the initial form before querying Supabase", async () => {
    const response = await onRequestPost({
      request: post({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, parentName: "Marie", parentEmail: "bad-email" }),
      env: {}
    });
    expect(response.status).toBe(400);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("adds a callback request only after the lead exists", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: ATTEMPT_ID, quiz_id: QUIZ_ID }])
      .mockResolvedValueOnce([{ id: "lead-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await onRequestPost({
      request: post({
        mode: "callback",
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        parentPhone: "0600000000",
        preferredContactTime: "soir"
      }),
      env: {}
    });

    expect(response.status).toBe(200);
    const update = JSON.parse(supabaseRequest.mock.calls[2][2].body);
    expect(update).toEqual(expect.objectContaining({
      parent_phone: "0600000000",
      callback_requested: true,
      preferred_contact_time: "soir"
    }));
  });

  it("rejects an incomplete callback before database access", async () => {
    const response = await onRequestPost({
      request: post({ mode: "callback", attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, preferredContactTime: "soir" }),
      env: {}
    });
    expect(response.status).toBe(400);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });
});
