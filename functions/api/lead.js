import { json, supabaseRequest, validUuid } from "../_common.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedConcerns = new Set([
  "notes",
  "confiance",
  "comprehension",
  "methode",
  "evaluation",
  "autre"
]);
const allowedContactTimes = new Set(["matin", "midi", "apres-midi", "soir"]);

async function resolveAttempt(env, body) {
  if (validUuid(body.shareToken)) {
    const shares = await supabaseRequest(
      env,
      `attempt_shares?share_token=eq.${body.shareToken}&share_type=eq.parent&select=id,attempt_id&limit=1`
    );

    if (!shares?.length) return null;

    const attempts = await supabaseRequest(
      env,
      `attempts?id=eq.${shares[0].attempt_id}&select=id,quiz_id&limit=1`
    );
    if (!attempts?.length) return null;

    return {
      attemptId: attempts[0].id,
      quizId: attempts[0].quiz_id,
      shareId: shares[0].id,
      leadSource: "parent_share"
    };
  }

  if (!validUuid(body.attemptId) || !validUuid(body.attemptToken)) {
    return null;
  }

  const attempts = await supabaseRequest(
    env,
    `attempts?id=eq.${body.attemptId}&public_token=eq.${body.attemptToken}&select=id,quiz_id&limit=1`
  );

  if (!attempts?.length) return null;

  return {
    attemptId: attempts[0].id,
    quizId: attempts[0].quiz_id,
    shareId: null,
    leadSource: "direct_result"
  };
}

async function trackLeadEvent(env, resolvedAttempt, body, eventName, metadata = {}) {
  await supabaseRequest(env, "funnel_events", {
    method: "POST",
    body: JSON.stringify({
      event_name: eventName,
      quiz_id: resolvedAttempt.quizId,
      attempt_id: resolvedAttempt.attemptId,
      share_id: resolvedAttempt.shareId,
      session_id: String(body.sessionId || "").slice(0, 80) || null,
      cta_variant: ["A", "B"].includes(body.ctaVariant) ? body.ctaVariant : null,
      metadata
    })
  }).catch(() => {});
}

async function saveInitialLead(context, body, resolvedAttempt) {
  const parentName = String(body.parentName || "").trim().slice(0, 80);
  const parentEmail = String(body.parentEmail || "").trim().toLowerCase().slice(0, 254);
  const mainConcern = String(body.mainConcern || "").trim();
  const emailMarketingConsent = body.emailMarketingConsent === true;

  if (!parentName) {
    return json({ error: "Le prénom du parent est obligatoire." }, 400);
  }

  if (!emailPattern.test(parentEmail)) {
    return json({ error: "Adresse e-mail invalide." }, 400);
  }

  if (mainConcern && !allowedConcerns.has(mainConcern)) {
    return json({ error: "Préoccupation invalide." }, 400);
  }

  const now = new Date().toISOString();
  await supabaseRequest(context.env, "parent_leads?on_conflict=attempt_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      attempt_id: resolvedAttempt.attemptId,
      share_id: resolvedAttempt.shareId,
      lead_source: resolvedAttempt.leadSource,
      parent_name: parentName,
      parent_email: parentEmail,
      main_concern: mainConcern || null,
      email_marketing_consent: emailMarketingConsent,
      email_marketing_consent_at: emailMarketingConsent ? now : null,
      updated_at: now
    })
  });

  await trackLeadEvent(context.env, resolvedAttempt, body, "lead_form_submitted", {
    main_concern: mainConcern || null,
    email_marketing_consent: emailMarketingConsent
  });

  return json({ ok: true }, 201);
}

async function saveCallbackRequest(context, body, resolvedAttempt) {
  const parentPhone = String(body.parentPhone || "").trim().slice(0, 30);
  const preferredContactTime = String(body.preferredContactTime || "").trim();

  if (!parentPhone) {
    return json({ error: "Ajoutez un numéro de téléphone." }, 400);
  }

  if (!allowedContactTimes.has(preferredContactTime)) {
    return json({ error: "Choisissez un moment pour être rappelé(e)." }, 400);
  }

  const existingLeads = await supabaseRequest(
    context.env,
    `parent_leads?attempt_id=eq.${resolvedAttempt.attemptId}&select=id&limit=1`
  );
  if (!existingLeads?.length) {
    return json({ error: "Envoyez d'abord la demande de bilan." }, 409);
  }

  const now = new Date().toISOString();
  await supabaseRequest(context.env, `parent_leads?attempt_id=eq.${resolvedAttempt.attemptId}`, {
    method: "PATCH",
    body: JSON.stringify({
      parent_phone: parentPhone,
      callback_requested: true,
      callback_requested_at: now,
      preferred_contact_time: preferredContactTime,
      updated_at: now
    })
  });

  await trackLeadEvent(context.env, resolvedAttempt, body, "callback_requested", {
    preferred_contact_time: preferredContactTime
  });

  return json({ ok: true }, 200);
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    if (body.mode === "callback") {
      const parentPhone = String(body.parentPhone || "").trim();
      const preferredContactTime = String(body.preferredContactTime || "").trim();
      if (!parentPhone) return json({ error: "Ajoutez un numéro de téléphone." }, 400);
      if (!allowedContactTimes.has(preferredContactTime)) {
        return json({ error: "Choisissez un moment pour être rappelé(e)." }, 400);
      }
    } else {
      const parentName = String(body.parentName || "").trim();
      const parentEmail = String(body.parentEmail || "").trim().toLowerCase();
      const mainConcern = String(body.mainConcern || "").trim();
      if (!parentName) return json({ error: "Le prénom du parent est obligatoire." }, 400);
      if (!emailPattern.test(parentEmail)) return json({ error: "Adresse e-mail invalide." }, 400);
      if (mainConcern && !allowedConcerns.has(mainConcern)) {
        return json({ error: "Préoccupation invalide." }, 400);
      }
    }

    const resolvedAttempt = await resolveAttempt(context.env, body);
    if (!resolvedAttempt) {
      return json({ error: "Participation introuvable." }, 404);
    }

    if (body.mode === "callback") {
      return saveCallbackRequest(context, body, resolvedAttempt);
    }

    return saveInitialLead(context, body, resolvedAttempt);
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
