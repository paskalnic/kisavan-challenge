import { json, supabaseRequest, validUuid } from "../_common.js";

const subjectLabels = {
  maths: "Mathématiques",
  francais: "Français",
  sciences: "Sciences"
};

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const shareToken = url.searchParams.get("token");

    if (!validUuid(shareToken)) {
      return json({ error: "Lien de bilan invalide." }, 400);
    }

    const shares = await supabaseRequest(
      context.env,
      `attempt_shares?share_token=eq.${shareToken}&share_type=eq.parent&select=id,attempt_id,open_count&limit=1`
    );

    if (!shares?.length) {
      return json({ error: "Ce lien de bilan n'existe pas ou n'est plus disponible." }, 404);
    }

    const share = shares[0];
    const attempts = await supabaseRequest(
      context.env,
      `attempts?id=eq.${share.attempt_id}&select=id,quiz_id,alias,score,total,duration_ms,skill_summary,strengths_text,work_priorities_text,diagnostic_text&limit=1`
    );

    if (!attempts?.length) {
      return json({ error: "Résultat introuvable." }, 404);
    }

    const attempt = attempts[0];
    const quizzes = await supabaseRequest(
      context.env,
      `quizzes?id=eq.${attempt.quiz_id}&select=title,week_label,level,subject&limit=1`
    );

    if (!quizzes?.length) {
      return json({ error: "Quiz introuvable." }, 404);
    }

    const quiz = quizzes[0];
    const now = new Date().toISOString();
    const trackingUpdates = Promise.allSettled([
      supabaseRequest(context.env, `attempt_shares?id=eq.${share.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          open_count: Number(share.open_count || 0) + 1,
          last_opened_at: now
        })
      }),
      supabaseRequest(context.env, "funnel_events", {
        method: "POST",
        body: JSON.stringify({
          event_name: "share_link_opened",
          quiz_id: attempt.quiz_id,
          attempt_id: attempt.id,
          share_id: share.id,
          metadata: {}
        })
      })
    ]);

    if (typeof context.waitUntil === "function") {
      context.waitUntil(trackingUpdates);
    } else {
      await trackingUpdates;
    }

    return json({
      result: {
        attemptId: attempt.id,
        alias: attempt.alias,
        score: attempt.score,
        total: attempt.total,
        durationSeconds: Math.round(attempt.duration_ms / 1000),
        skillSummary: Array.isArray(attempt.skill_summary) ? attempt.skill_summary : [],
        strengthsText: attempt.strengths_text || "",
        workPrioritiesText: attempt.work_priorities_text || "",
        diagnosticText: attempt.diagnostic_text || "",
        quiz: {
          title: quiz.title,
          weekLabel: quiz.week_label,
          level: quiz.level,
          subject: quiz.subject,
          subjectLabel: subjectLabels[quiz.subject] || quiz.subject
        }
      }
    });
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
