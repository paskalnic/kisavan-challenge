import { json, supabaseRequest, validUuid } from "../_common.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    if (!validUuid(body.attemptId) || !validUuid(body.attemptToken)) {
      return json({ error: "Participation invalide." }, 400);
    }

    const parentName = String(body.parentName || "").trim().slice(0, 80);
    const parentEmail = String(body.parentEmail || "").trim().toLowerCase().slice(0, 254);
    const parentPhone = String(body.parentPhone || "").trim().slice(0, 30) || null;
    const childLevel = String(body.childLevel || "").trim().slice(0, 30) || null;
    const mainDifficulty = String(body.mainDifficulty || "").trim().slice(0, 300) || null;
    const callbackRequested = body.callbackRequested === true;
    const emailMarketingConsent = body.emailMarketingConsent === true;

    if (!parentName) {
      return json({ error: "Le prénom du parent est obligatoire." }, 400);
    }

    if (!emailPattern.test(parentEmail)) {
      return json({ error: "Adresse e-mail invalide." }, 400);
    }

    if (callbackRequested && !parentPhone) {
      return json({ error: "Ajoutez un numéro pour demander un rappel." }, 400);
    }

    const attempts = await supabaseRequest(
      context.env,
      `attempts?id=eq.${body.attemptId}&public_token=eq.${body.attemptToken}&select=id`
    );

    if (!attempts?.length) {
      return json({ error: "Participation introuvable." }, 404);
    }

    await supabaseRequest(context.env, "parent_leads", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        attempt_id: body.attemptId,
        parent_name: parentName,
        parent_email: parentEmail,
        parent_phone: parentPhone,
        child_level: childLevel,
        main_difficulty: mainDifficulty,
        callback_requested: callbackRequested,
        email_marketing_consent: emailMarketingConsent
      })
    });

    return json({ ok: true }, 201);
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
