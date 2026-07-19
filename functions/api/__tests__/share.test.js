import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return { ...actual, supabaseRequest: vi.fn() };
});

import { onRequestPost } from "../share.js";
import { supabaseRequest } from "../../_common.js";

const ATTEMPT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ATTEMPT_TOKEN = "123e4567-e89b-12d3-a456-426614174001";
const SHARE_TOKEN = "123e4567-e89b-12d3-a456-426614174002";
const SHARE_ID = "123e4567-e89b-12d3-a456-426614174003";
const QUIZ_ID = "123e4567-e89b-12d3-a456-426614174004";

function request(shareType = "parent") {
  return new Request("https://example.com/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      shareType,
      sessionId: "session-1",
      ctaVariant: "B"
    })
  });
}

describe("share API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reuses the existing private parent link and tracks it", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: ATTEMPT_ID, quiz_id: QUIZ_ID }])
      .mockResolvedValueOnce([{ id: SHARE_ID, share_token: SHARE_TOKEN }])
      .mockResolvedValueOnce([]);

    const response = await onRequestPost({ request: request(), env: {} });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ shareToken: SHARE_TOKEN });
    const event = JSON.parse(supabaseRequest.mock.calls[2][2].body);
    expect(event.metadata.reused).toBe(true);
  });

  it("creates the link once when none exists", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: ATTEMPT_ID, quiz_id: QUIZ_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: SHARE_ID, share_token: SHARE_TOKEN }])
      .mockResolvedValueOnce([]);

    const response = await onRequestPost({ request: request(), env: {} });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ shareToken: SHARE_TOKEN });
    expect(supabaseRequest.mock.calls[2][1]).toBe("attempt_shares?select=id,share_token");
  });

  it("rejects a friend link because friend sharing uses the public challenge URL", async () => {
    const response = await onRequestPost({ request: request("friend"), env: {} });
    expect(response.status).toBe(400);
  });
});
