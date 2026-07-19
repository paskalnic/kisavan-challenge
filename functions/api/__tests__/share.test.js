import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return {
    ...actual,
    supabaseRequest: vi.fn()
  };
});

import { onRequestPost } from "../share.js";
import { supabaseRequest } from "../../_common.js";

const ATTEMPT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ATTEMPT_TOKEN = "123e4567-e89b-12d3-a456-426614174001";
const SHARE_TOKEN = "123e4567-e89b-12d3-a456-426614174002";

describe("share API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an existing parent share token", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: ATTEMPT_ID }])
      .mockResolvedValueOnce([{ share_token: SHARE_TOKEN }]);

    const request = new Request("https://example.com/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        shareType: "parent"
      })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ shareToken: SHARE_TOKEN });
    expect(supabaseRequest).toHaveBeenCalledTimes(2);
  });

  it("creates a parent share token when none exists", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: ATTEMPT_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ share_token: SHARE_TOKEN }]);

    const request = new Request("https://example.com/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        shareType: "parent"
      })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ shareToken: SHARE_TOKEN });
    expect(supabaseRequest).toHaveBeenNthCalledWith(
      3,
      {},
      "attempt_shares?select=share_token",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects invalid share types", async () => {
    const request = new Request("https://example.com/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        shareType: "friend"
      })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(400);
  });
});
