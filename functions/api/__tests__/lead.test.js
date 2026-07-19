import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_common.js", async () => {
  const actual = await vi.importActual("../../_common.js");
  return {
    ...actual,
    supabaseRequest: vi.fn()
  };
});

import { onRequestPost } from "../lead.js";
import { supabaseRequest } from "../../_common.js";

const ATTEMPT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ATTEMPT_TOKEN = "123e4567-e89b-12d3-a456-426614174001";
const SHARE_TOKEN = "123e4567-e89b-12d3-a456-426614174002";
const SHARE_ID = "123e4567-e89b-12d3-a456-426614174003";

describe("lead API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a light lead connected directly to an attempt", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: ATTEMPT_ID }])
      .mockResolvedValueOnce([]);

    const request = new Request("https://example.com/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        parentName: "Marie",
        parentEmail: "marie@example.com",
        parentPhone: "0600000000",
        postalCode: "75001",
        callbackRequested: true,
        emailMarketingConsent: false
      })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const insertOptions = supabaseRequest.mock.calls[1][2];
    const insertedLead = JSON.parse(insertOptions.body);
    expect(insertedLead).toEqual(expect.objectContaining({
      attempt_id: ATTEMPT_ID,
      share_id: null,
      lead_source: "direct_result",
      parent_name: "Marie",
      parent_email: "marie@example.com",
      postal_code: "75001",
      callback_requested: true
    }));
  });

  it("stores a lead connected through a parent share token", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: SHARE_ID, attempt_id: ATTEMPT_ID }])
      .mockResolvedValueOnce([]);

    const request = new Request("https://example.com/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shareToken: SHARE_TOKEN,
        parentName: "Paul",
        parentEmail: "paul@example.com",
        callbackRequested: false,
        emailMarketingConsent: true
      })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(201);

    const insertedLead = JSON.parse(supabaseRequest.mock.calls[1][2].body);
    expect(insertedLead).toEqual(expect.objectContaining({
      attempt_id: ATTEMPT_ID,
      share_id: SHARE_ID,
      lead_source: "parent_share",
      email_marketing_consent: true
    }));
    expect(insertedLead.email_marketing_consent_at).toEqual(expect.any(String));
  });

  it("returns 400 when email is invalid", async () => {
    const request = new Request("https://example.com/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        parentName: "Marie",
        parentEmail: "bad-email"
      })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Adresse e-mail invalide." });
  });

  it("requires a phone number only when a callback is requested", async () => {
    const request = new Request("https://example.com/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        parentName: "Marie",
        parentEmail: "marie@example.com",
        callbackRequested: true
      })
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Ajoutez un numéro pour demander un rappel."
    });
  });
});
