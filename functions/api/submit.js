import { json, randomAlias, supabaseRequest, validUuid } from "../_common.js";

function buildSkillSummary(questions, answerMap) {
  const skills = new Map();

  for (const question of questions) {
    const code = question.skill_code || "general";
    const label = question.skill_label || "Compétences générales";
    const skill = skills.get(code) || { code, label, correct: 0, total: 0 };
    skill.total += 1;
    if (answerMap.get(question.id) === question.correct_index) {
      skill.correct += 1;
    }
    skills.set(code, skill);
  }

  return [...skills.values()].map((skill) => ({
    ...skill,
    percentage: Math.round((skill.correct / skill.total) * 100)
  }));
}

function validateAnswers(questions, answers) {
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    return null;
  }

  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const answerMap = new Map();

  for (const answer of answers) {
    const question = questionMap.get(answer?.questionId);
    const choiceIndex = Number(answer?.choiceIndex);

    if (
      !question ||
      answerMap.has(question.id) ||
      !Number.isInteger(choiceIndex) ||
      choiceIndex < 0 ||
      choiceIndex >= question.choice_count
    ) {
      return null;
    }

    answerMap.set(question.id, choiceIndex);
  }

  return answerMap.size === questions.length ? answerMap : null;
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    if (!validUuid(body.quizId)) {
      return json({ error: "Quiz invalide." }, 400);
    }

    const durationMs = Math.max(1000, Math.min(Number(body.durationMs) || 0, 3600000));

    const questions = await supabaseRequest(
      context.env,
      `questions?quiz_id=eq.${body.quizId}&select=id,correct_index,choices,skill_code,skill_label`
    );

    if (!questions?.length) {
      return json({ error: "Quiz introuvable." }, 404);
    }

    const normalizedQuestions = questions.map((question) => ({
      ...question,
      choice_count: Array.isArray(question.choices) ? question.choices.length : 0
    }));
    const answerMap = validateAnswers(normalizedQuestions, body.answers);

    if (!answerMap) {
      return json({ error: "Toutes les réponses doivent être valides et uniques." }, 400);
    }

    const score = normalizedQuestions.reduce(
      (total, question) => total + (answerMap.get(question.id) === question.correct_index ? 1 : 0),
      0
    );
    const skillSummary = buildSkillSummary(normalizedQuestions, answerMap);
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
          total: normalizedQuestions.length,
          duration_ms: durationMs,
          public_token: attemptToken,
          skill_summary: skillSummary
        })
      }
    );

    const attemptId = insertedAttempts[0].id;
    const answerRows = normalizedQuestions.map((question) => {
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

    await supabaseRequest(context.env, "funnel_events", {
      method: "POST",
      body: JSON.stringify({
        event_name: "quiz_completed",
        quiz_id: body.quizId,
        attempt_id: attemptId,
        session_id: String(body.sessionId || "").slice(0, 80) || null,
        cta_variant: ["A", "B"].includes(body.ctaVariant) ? body.ctaVariant : null,
        metadata: { score, total: normalizedQuestions.length, duration_ms: durationMs }
      })
    }).catch(() => {});

    return json(
      {
        attemptId,
        attemptToken,
        alias,
        score,
        total: normalizedQuestions.length,
        durationMs,
        skillSummary
      },
      201
    );
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
