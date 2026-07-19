import { json, supabaseRequest } from "../_common.js";

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const slug = (url.searchParams.get("slug") || "").trim().slice(0, 80);

    if (!slug) return json({ error: "Quiz non précisé." }, 400);

    const quizzes = await supabaseRequest(
      context.env,
      `quizzes?slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=id,slug,title,week_label,level,subject&limit=1`
    );

    if (!quizzes?.length) return json({ error: "Ce quiz n'est pas disponible." }, 404);

    const quiz = quizzes[0];
    const questions = await supabaseRequest(
      context.env,
      `questions?quiz_id=eq.${quiz.id}&select=id,prompt,explanation,choices,position,correct_index,skill_code,skill_label&order=position.asc`
    );

    return json({ quiz, questions });
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
