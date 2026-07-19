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

function joinFrench(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

export function buildDiagnosticTexts(skillSummary) {
  const ranked = [...skillSummary].sort((a, b) => b.percentage - a.percentage || a.label.localeCompare(b.label, "fr"));
  const strengths = ranked.filter((skill) => skill.percentage >= 75).slice(0, 2);
  const priorities = [...ranked].reverse().filter((skill) => skill.percentage < 100).slice(0, 2);

  const strengthsText = strengths.length
    ? `Points d'appui : ${joinFrench(strengths.map((skill) => skill.label.toLowerCase()))}.`
    : "Les acquis restent à consolider dans plusieurs domaines ; l'élève gagnerait à reprendre les bases progressivement.";

  const workPrioritiesText = priorities.length
    ? `Priorités de travail : ${joinFrench(priorities.map((skill) => skill.label.toLowerCase()))}.`
    : "Aucune difficulté prioritaire ne ressort de ce quiz ; il convient de maintenir les acquis par un entraînement régulier.";

  let diagnosticText;
  if (!priorities.length) {
    diagnosticText = "L'élève maîtrise solidement les compétences évaluées. Un entraînement régulier permettra de maintenir ces acquis et de gagner encore en aisance.";
  } else if (strengths.length) {
    diagnosticText = `L'élève montre de bons acquis en ${joinFrench(strengths.map((skill) => skill.label.toLowerCase()))}, mais ses réponses révèlent des fragilités en ${joinFrench(priorities.map((skill) => skill.label.toLowerCase()))}. Ces domaines doivent être travaillés en priorité avec des exercices progressifs et une reprise des erreurs.`;
  } else {
    diagnosticText = `Les résultats montrent des fragilités dans plusieurs compétences, en particulier en ${joinFrench(priorities.map((skill) => skill.label.toLowerCase()))}. Il est conseillé de reprendre les notions de base, puis de vérifier les progrès avec des exercices courts et réguliers.`;
  }

  return { strengthsText, workPrioritiesText, diagnosticText };
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
    const diagnosticTexts = buildDiagnosticTexts(skillSummary);
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
          skill_summary: skillSummary,
          strengths_text: diagnosticTexts.strengthsText,
          work_priorities_text: diagnosticTexts.workPrioritiesText,
          diagnostic_text: diagnosticTexts.diagnosticText
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
        skillSummary,
        ...diagnosticTexts
      },
      201
    );
  } catch (error) {
    return json({ error: error.message || "Erreur serveur." }, 500);
  }
}
