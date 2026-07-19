import { json, supabaseRequest, validUuid } from "../_common.js";

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    if (!validUuid(body.attemptId) || !validUuid(body.attemptToken)) {
      return json({ error: "Participation invalide." }, 400);
    }

    if (body.shareType !== "parent") {
      return json({ error: "Type de partage invalide." }, 400);
    }

    const attempts = await supabaseRequest(
      context.env,
      `attempts?id=eq.${body.attemptId}&public_token=eq.${body.attemptToken}&select=id&limit=1`
    );

    if (!attempts?.length) {
      return json({ error: "Participation introuvable." }, 404);
    }

    const existingShares = await supabaseRequest(
      context.env,
      `attempt_shares?attempt_id=eq.${body.attemptId}&share_type=eq.parent&select=share_token&limit=1`
    );

    if (existingShares?.length) {
      return json({ shareToken: existingShares[0].share_token });
    }

    const shareToken = crypto.randomUUID();
    const insertedShares = await supabaseRequest(
      context.env,
      "attempt_shares?select=share_token",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          attempt_id: body.attemptId,
          share_type: "parent",
          share_token: shareToken
        })
      }
    );

    return json(
      { shareToken: insertedShares?.[0]?.share_token || shareToken },
      201
    );
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
