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
      `attempts?id=eq.${body.attemptId}&public_token=eq.${body.attemptToken}&select=id,quiz_id&limit=1`
    );

    if (!attempts?.length) {
      return json({ error: "Participation introuvable." }, 404);
    }

    const attempt = attempts[0];
    const existingShares = await supabaseRequest(
      context.env,
      `attempt_shares?attempt_id=eq.${body.attemptId}&share_type=eq.parent&select=id,share_token&limit=1`
    );

    let share;
    let status = 200;

    if (existingShares?.length) {
      share = existingShares[0];
    } else {
      const shareToken = crypto.randomUUID();
      const insertedShares = await supabaseRequest(
        context.env,
        "attempt_shares?select=id,share_token",
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
      share = insertedShares?.[0] || { id: null, share_token: shareToken };
      status = 201;
    }

    await supabaseRequest(context.env, "funnel_events", {
      method: "POST",
      body: JSON.stringify({
        event_name: "parent_share_link_created",
        quiz_id: attempt.quiz_id,
        attempt_id: attempt.id,
        share_id: share.id,
        session_id: String(body.sessionId || "").slice(0, 80) || null,
        cta_variant: ["A", "B"].includes(body.ctaVariant) ? body.ctaVariant : null,
        metadata: { reused: status === 200 }
      })
    }).catch(() => {});

    return json({ shareToken: share.share_token }, status);
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
