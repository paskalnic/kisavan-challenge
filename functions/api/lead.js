import { json, supabaseRequest, validUuid } from "../_common.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const postalCodePattern = /^\d{5}$/;

async function resolveAttempt(env, body) {
  if (validUuid(body.shareToken)) {
    const shares = await supabaseRequest(
      env,
      `attempt_shares?share_token=eq.${body.shareToken}&share_type=eq.parent&select=id,attempt_id&limit=1`
    );

    if (!shares?.length) return null;

    return {
      attemptId: shares[0].attempt_id,
      shareId: shares[0].id,
      leadSource: "parent_share"
    };
  }

  if (!validUuid(body.attemptId) || !validUuid(body.attemptToken)) {
    return null;
  }

  const attempts = await supabaseRequest(
    env,
    `attempts?id=eq.${body.attemptId}&public_token=eq.${body.attemptToken}&select=id&limit=1`
  );

  if (!attempts?.length) return null;

  return {
    attemptId: attempts[0].id,
    shareId: null,
    leadSource: "direct_result"
  };
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const parentName = String(body.parentName || "").trim().slice(0, 80);
    const parentEmail = String(body.parentEmail || "")
      .trim()
      .toLowerCase()
      .slice(0, 254);
    const parentPhone = String(body.parentPhone || "").trim().slice(0, 30) || null;
    const postalCode = String(body.postalCode || "").trim().slice(0, 5) || null;
    const callbackRequested = body.callbackRequested === true;
    const emailMarketingConsent = body.emailMarketingConsent === true;

    if (!parentName) {
      return json({ error: "Le prénom du parent est obligatoire." }, 400);
    }

    if (!emailPattern.test(parentEmail)) {
      return json({ error: "Adresse e-mail invalide." }, 400);
    }

    if (postalCode && !postalCodePattern.test(postalCode)) {
      return json({ error: "Le code postal doit contenir exactement 5 chiffres." }, 400);
    }

    if (callbackRequested && !parentPhone) {
      return json({ error: "Ajoutez un numéro pour demander un rappel." }, 400);
    }

    const resolvedAttempt = await resolveAttempt(context.env, body);
    if (!resolvedAttempt) {
      return json({ error: "Participation introuvable." }, 404);
    }

    const now = new Date().toISOString();

    await supabaseRequest(
      context.env,
      "parent_leads?on_conflict=attempt_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          attempt_id: resolvedAttempt.attemptId,
          share_id: resolvedAttempt.shareId,
          lead_source: resolvedAttempt.leadSource,
          parent_name: parentName,
          parent_email: parentEmail,
          parent_phone: parentPhone,
          postal_code: postalCode,
          callback_requested: callbackRequested,
          callback_requested_at: callbackRequested ? now : null,
          email_marketing_consent: emailMarketingConsent,
          email_marketing_consent_at: emailMarketingConsent ? now : null,
          updated_at: now
        })
      }
    );

    return json({ ok: true }, 201);
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
