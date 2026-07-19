import { json, supabaseRequest, validUuid } from "../_common.js";

const allowedEvents = new Set([
  "quiz_viewed",
  "quiz_started",
  "question_answered",
  "parent_share_clicked",
  "share_menu_opened",
  "parent_share_completed",
  "friend_share_clicked",
  "friend_share_completed",
  "lead_form_viewed"
]);

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const eventName = String(body.eventName || "").trim();

    if (!allowedEvents.has(eventName)) {
      return json({ error: "Événement invalide." }, 400);
    }

    if (body.quizId && !validUuid(body.quizId)) {
      return json({ error: "Quiz invalide." }, 400);
    }

    if (body.attemptId && !validUuid(body.attemptId)) {
      return json({ error: "Participation invalide." }, 400);
    }

    const sessionId = String(body.sessionId || "").trim().slice(0, 80) || null;
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata
      : {};

    await supabaseRequest(context.env, "funnel_events", {
      method: "POST",
      body: JSON.stringify({
        event_name: eventName,
        quiz_id: body.quizId || null,
        attempt_id: body.attemptId || null,
        session_id: sessionId,
        cta_variant: ["A", "B"].includes(body.ctaVariant) ? body.ctaVariant : null,
        metadata
      })
    });

    return json({ ok: true }, 201);
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
