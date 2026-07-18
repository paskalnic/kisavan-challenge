import { json, randomAlias, supabaseRequest, validUuid } from "../_common.js";

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    if (!validUuid(body.quizId)) {
      return json({ error: "Quiz invalide." }, 400);
    }

    if (!Array.isArray(body.answers)) {
      return json({ error: "Réponses invalides." }, 400);
    }

    const durationMs = Math.max(
      1000,
      Math.min(Number(body.durationMs) || 0, 3600000)
    );

    const questions = await supabaseRequest(
      context.env,
      `questions?quiz_id=eq.${body.quizId}&select=id,correct_index`
    );

    if (!questions?.length) {
      return json({ error: "Quiz introuvable." }, 404);
    }

    const answerMap = new Map(
      body.answers.map((answer) => [
        answer.questionId,
        Number(answer.choiceIndex)
      ])
    );

    let score = 0;
    for (const question of questions) {
      if (answerMap.get(question.id) === question.correct_index) {
        score++;
      }
    }

    const alias = randomAlias();
    const attemptToken = crypto.randomUUID();

    const insertedAttempts = await supabaseRequest(
      context.env,
      "attempts?select=id",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          quiz_id: body.quizId,
          alias,
          score,
          total: questions.length,
          duration_ms: durationMs,
          public_token: attemptToken
        })
      }
    );

    const attemptId = insertedAttempts[0].id;

    const answerRows = questions.map((question) => {
      const selectedIndex = answerMap.get(question.id);
      return {
        attempt_id: attemptId,
        question_id: question.id,
        selected_index: selectedIndex,
        is_correct: selectedIndex === question.correct_index
      };
    });

    await supabaseRequest(context.env, "attempt_answers", {
      method: "POST",
      body: JSON.stringify(answerRows)
    });

    return json(
      {
        attemptId,
        attemptToken,
        alias,
        score,
        total: questions.length,
        durationMs
      },
      201
    );
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
