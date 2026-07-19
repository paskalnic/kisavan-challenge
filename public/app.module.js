export const ACTIVE_QUIZ_SLUG = "francais-5e-diagnostic-v2";

const CTA_VARIANTS = {
  A: {
    kicker: "Pour progresser",
    heading: "Obtenir de l’aide sur mes difficultés",
    button: "Envoyer à un parent"
  },
  B: {
    kicker: "Étape suivante",
    heading: "Comprendre mes erreurs",
    button: "Transmettre mon résultat"
  }
};

export const state = {
  quizId: null,
  quiz: null,
  questions: [],
  answers: {},
  index: 0,
  startedAt: null,
  timerId: null,
  attemptId: null,
  attemptToken: null,
  parentShareToken: null,
  parentMode: false,
  sharedResult: null,
  skillSummary: [],
  sessionId: null,
  ctaVariant: null
};

export const $ = (id) => document.getElementById(id);
export const attemptKey = () => `kisavan_attempt_${state.quizId}`;

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

export function setView(view) {
  document.body.dataset.view = view;
}

export const show = (id) => {
  const element = $(id);
  if (!element) return;
  element.classList.remove("hidden");

  if (element.classList.contains("card")) {
    element.classList.remove("animate-in");
    const animate = window.requestAnimationFrame || ((callback) => callback());
    animate(() => element.classList.add("animate-in"));
  }
};

export const hide = (id) => {
  const element = $(id);
  if (!element) return;
  element.classList.add("hidden");
  element.classList.remove("animate-in");
};

function setStatus(id, message, status = "") {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  if (status) element.dataset.status = status;
  else delete element.dataset.status;
}

function safeRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getSessionId() {
  if (state.sessionId) return state.sessionId;

  const stored = localStorage.getItem("kisavan_session_id");
  state.sessionId = stored || safeRandomId();
  if (!stored) localStorage.setItem("kisavan_session_id", state.sessionId);
  return state.sessionId;
}

export function getCtaVariant() {
  if (state.ctaVariant) return state.ctaVariant;

  const stored = localStorage.getItem("kisavan_cta_variant");
  state.ctaVariant = ["A", "B"].includes(stored)
    ? stored
    : Math.random() < 0.5 ? "A" : "B";
  localStorage.setItem("kisavan_cta_variant", state.ctaVariant);
  return state.ctaVariant;
}

export function applyCtaVariant() {
  const variant = CTA_VARIANTS[getCtaVariant()];
  if ($("parent-action-kicker")) $("parent-action-kicker").textContent = variant.kicker;
  if ($("parent-action-heading")) $("parent-action-heading").textContent = variant.heading;
  if ($("share-parent-btn")) $("share-parent-btn").textContent = variant.button;
}

export async function trackEvent(eventName, metadata = {}) {
  try {
    await api("/api/event", {
      method: "POST",
      keepalive: true,
      body: JSON.stringify({
        eventName,
        quizId: state.quizId,
        attemptId: state.attemptId,
        sessionId: getSessionId(),
        ctaVariant: getCtaVariant(),
        metadata
      })
    });
  } catch {
    // La mesure ne doit jamais bloquer le quiz.
  }
}

let audioContext;
function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContext) {
    audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playTone(frequency, duration = 0.14, type = "sine") {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(context.destination);

  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function playAnswerSound(isCorrect) {
  if (isCorrect) {
    playTone(880, 0.16, "triangle");
    playTone(1320, 0.1, "triangle");
  } else {
    playTone(220, 0.16, "sawtooth");
  }
}

export function showExplanation() {
  const card = $("explanation-card");
  if (!card) return;
  card.open = false;
  card.classList.remove("hidden");
}

export function hideExplanation() {
  const card = $("explanation-card");
  if (!card) return;
  card.open = false;
  card.classList.add("hidden");
}

export function readStoredAttempt() {
  const rawValue = localStorage.getItem(attemptKey());
  if (!rawValue) return null;

  try {
    const stored = JSON.parse(rawValue);
    if (
      stored &&
      typeof stored.attemptId === "string" &&
      typeof stored.attemptToken === "string" &&
      typeof stored.alias === "string" &&
      Number.isFinite(stored.score) &&
      Number.isFinite(stored.total) &&
      Number.isFinite(stored.durationMs)
    ) {
      return {
        ...stored,
        skillSummary: Array.isArray(stored.skillSummary) ? stored.skillSummary : []
      };
    }
  } catch {
    // Une ancienne valeur locale ne doit pas casser le chargement.
  }

  return null;
}

function splitSkillSummary(summary = []) {
  const normalized = summary
    .filter((skill) => skill && Number.isFinite(skill.correct) && Number.isFinite(skill.total))
    .map((skill) => ({
      ...skill,
      percentage: Number.isFinite(skill.percentage)
        ? skill.percentage
        : Math.round((skill.correct / Math.max(skill.total, 1)) * 100)
    }));

  return {
    strengths: [...normalized].sort((a, b) => b.percentage - a.percentage).slice(0, 2),
    focus: [...normalized].sort((a, b) => a.percentage - b.percentage).slice(0, 2)
  };
}

function renderSkillList(id, skills, emptyText) {
  const container = $(id);
  if (!container) return;
  container.replaceChildren();

  if (!skills.length) {
    const item = document.createElement("li");
    item.textContent = emptyText;
    container.appendChild(item);
    return;
  }

  for (const skill of skills) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const score = document.createElement("strong");
    label.textContent = skill.label;
    score.textContent = `${skill.correct}/${skill.total}`;
    item.append(label, score);
    container.appendChild(item);
  }
}

export function renderSkillSummary(summary, prefix) {
  const { strengths, focus } = splitSkillSummary(summary);
  renderSkillList(`${prefix}-strengths`, strengths, "Résultat global encourageant.");
  renderSkillList(`${prefix}-focus`, focus, "Aucune difficulté prioritaire détectée.");
}

function resultEncouragement(score, total) {
  const ratio = total ? score / total : 0;
  if (ratio >= 0.8) return "Très bon résultat : quelques détails peuvent encore être consolidés.";
  if (ratio >= 0.5) return "Tu as de bonnes bases. Le bilan montre maintenant où progresser en priorité.";
  return "Ce résultat sert à repérer les notions à retravailler, pas à te juger.";
}

export function displayResult(result) {
  state.attemptId = result.attemptId;
  state.attemptToken = result.attemptToken;
  state.parentShareToken = null;
  state.skillSummary = Array.isArray(result.skillSummary) ? result.skillSummary : [];

  hide("start-card");
  hide("quiz-card");
  hide("parent-card");
  hide("lead-card");
  show("result-card");
  setView("result");

  $("result-score-number").textContent = `${result.score}/${result.total}`;
  $("result-text").textContent = resultEncouragement(result.score, result.total);
  renderSkillSummary(state.skillSummary, "result");
  applyCtaVariant();
}

export async function loadQuiz() {
  const data = await api(`/api/quiz?slug=${encodeURIComponent(ACTIVE_QUIZ_SLUG)}`);

  state.quizId = data.quiz.id;
  state.quiz = data.quiz;
  state.questions = data.questions;
  state.answers = {};
  state.index = 0;
  $("subtitle").textContent = `${data.quiz.title} — ${data.quiz.week_label}`;
  setView("start");
  applyCtaVariant();
  void trackEvent("quiz_viewed", { slug: data.quiz.slug });

  const storedValue = localStorage.getItem(attemptKey());
  const storedAttempt = readStoredAttempt();

  if (storedAttempt) {
    displayResult(storedAttempt);
    return;
  }

  if (storedValue) {
    $("start-btn").disabled = true;
    $("start-btn").textContent = "Déjà participé sur cet appareil";
  } else {
    $("start-btn").disabled = false;
    $("start-btn").textContent = "Commencer le diagnostic";
  }
}

export function renderQuestion() {
  const question = state.questions[state.index];
  if (!question) return;

  const selectedIndex = state.answers[question.id];
  const hasAnswered = selectedIndex !== undefined;
  const correctIndex = question.correct_index;

  $("progress").textContent = `Question ${state.index + 1}/${state.questions.length}`;
  $("question-text").textContent = question.prompt;
  $("answers").replaceChildren();
  $("next-btn").disabled = !hasAnswered;

  question.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer";
    button.textContent = choice;

    if (selectedIndex === index) button.classList.add("selected");
    if (hasAnswered && typeof correctIndex === "number") {
      if (index === correctIndex) button.classList.add("correct");
      else if (index === selectedIndex) button.classList.add("incorrect");
    }

    button.onclick = () => {
      if (state.answers[question.id] !== undefined) return;
      state.answers[question.id] = index;
      const isCorrect = typeof correctIndex === "number" && index === correctIndex;
      playAnswerSound(isCorrect);
      void trackEvent("question_answered", {
        position: state.index + 1,
        skill_code: question.skill_code || null
      });
      $("question-text").classList.add("question-pop");
      setTimeout(() => $("question-text").classList.remove("question-pop"), 280);
      renderQuestion();
    };

    $("answers").appendChild(button);
  });

  if (hasAnswered && typeof correctIndex === "number") {
    $("explanation-text").textContent = question.explanation ||
      (selectedIndex === correctIndex
        ? "Bonne réponse !"
        : "La bonne réponse est indiquée en vert ci-dessus.");
    showExplanation();
  } else {
    hideExplanation();
  }

  $("next-btn").textContent = state.index === state.questions.length - 1
    ? "Voir mon diagnostic"
    : "Question suivante";

  const scrollArea = document.querySelector(".question-scroll-area");
  if (scrollArea) scrollArea.scrollTop = 0;
}

export function startTimer() {
  clearInterval(state.timerId);
  state.startedAt = Date.now();
  $("timer").textContent = "00:00";

  state.timerId = setInterval(() => {
    const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
    $("timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }, 250);
}

export async function submitQuiz() {
  clearInterval(state.timerId);

  const payload = {
    quizId: state.quizId,
    answers: state.questions.map((question) => ({
      questionId: question.id,
      choiceIndex: state.answers[question.id]
    })),
    durationMs: Date.now() - state.startedAt,
    sessionId: getSessionId(),
    ctaVariant: getCtaVariant()
  };

  $("next-btn").disabled = true;
  $("next-btn").textContent = "Analyse en cours...";

  try {
    const result = await api("/api/submit", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const storedAttempt = {
      attemptId: result.attemptId,
      attemptToken: result.attemptToken,
      alias: result.alias,
      score: result.score,
      total: result.total,
      durationMs: result.durationMs,
      skillSummary: result.skillSummary
    };

    localStorage.setItem(attemptKey(), JSON.stringify(storedAttempt));
    displayResult(storedAttempt);
  } catch (error) {
    setStatus("quiz-message", error.message, "error");
    $("next-btn").disabled = false;
    $("next-btn").textContent = "Réessayer";
  }
}

export function buildChallengeUrl() {
  return new URL("/partage/challenge", window.location.origin).toString();
}

export function buildParentResultUrl(shareToken) {
  return new URL(`/bilan/${encodeURIComponent(shareToken)}`, window.location.origin).toString();
}

export async function ensureParentShareToken() {
  if (state.parentShareToken) return state.parentShareToken;
  if (!state.attemptId || !state.attemptToken) {
    throw new Error("Participation introuvable. Termine d'abord le quiz.");
  }

  const result = await api("/api/share", {
    method: "POST",
    body: JSON.stringify({
      attemptId: state.attemptId,
      attemptToken: state.attemptToken,
      shareType: "parent",
      sessionId: getSessionId(),
      ctaVariant: getCtaVariant()
    })
  });

  state.parentShareToken = result.shareToken;
  return result.shareToken;
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = typeof document.execCommand === "function" && document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Impossible de copier automatiquement le lien.");
}

export async function shareOrCopy({ title, text, url }) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }

  await copyText(url);
  return "copied";
}

export async function shareParentResult() {
  setStatus("share-message", "Préparation du lien privé...", "");
  $("share-parent-btn").disabled = true;
  void trackEvent("parent_share_clicked");

  try {
    const shareToken = await ensureParentShareToken();
    if (typeof navigator.share === "function") void trackEvent("share_menu_opened", { target: "parent" });

    const result = await shareOrCopy({
      title: "Mon résultat Ki'Savan",
      text: "J’ai terminé un quiz de français 5e. Peux-tu regarder mon résultat et les notions à retravailler ?",
      url: buildParentResultUrl(shareToken)
    });

    if (result === "copied") {
      setStatus("share-message", "Le lien privé a été copié. Il ne reste plus qu’à l’envoyer à un parent.", "success");
      void trackEvent("parent_share_completed", { method: "copy_fallback" });
    } else if (result === "shared") {
      setStatus("share-message", "Résultat transmis.", "success");
      void trackEvent("parent_share_completed", { method: "native" });
    } else {
      setStatus("share-message", "Partage annulé.", "");
    }
  } catch (error) {
    setStatus("share-message", error.message, "error");
  } finally {
    $("share-parent-btn").disabled = false;
  }
}

export async function shareChallenge() {
  $("share-challenge-btn").disabled = true;
  void trackEvent("friend_share_clicked");

  try {
    if (typeof navigator.share === "function") void trackEvent("share_menu_opened", { target: "friend" });
    const result = await shareOrCopy({
      title: "Challenge français 5e Ki'Savan",
      text: "J’ai testé mon niveau en français 5e. À ton tour : peux-tu faire mieux ?",
      url: buildChallengeUrl()
    });

    if (result === "copied") {
      setStatus("share-message", "Lien du challenge copié.", "success");
      void trackEvent("friend_share_completed", { method: "copy_fallback" });
    } else if (result === "shared") {
      setStatus("share-message", "Défi partagé.", "success");
      void trackEvent("friend_share_completed", { method: "native" });
    } else {
      setStatus("share-message", "Partage annulé.", "");
    }
  } catch (error) {
    setStatus("share-message", error.message, "error");
  } finally {
    $("share-challenge-btn").disabled = false;
  }
}

export function showLeadForm() {
  $("lead-context-text").textContent = "Recevez l’analyse détaillée des réponses et les conseils prioritaires à travailler.";
  show("lead-card");
  void trackEvent("lead_form_viewed", { source: state.parentMode ? "parent_share" : "direct_result" });
  const card = $("lead-card");
  if (card && typeof card.scrollIntoView === "function") {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export async function loadSharedResult(shareToken) {
  const data = await api(`/api/shared-result?token=${encodeURIComponent(shareToken)}`);

  state.parentMode = true;
  state.parentShareToken = shareToken;
  state.sharedResult = data.result;
  state.attemptId = data.result.attemptId;
  state.skillSummary = Array.isArray(data.result.skillSummary) ? data.result.skillSummary : [];

  hide("start-card");
  hide("quiz-card");
  hide("result-card");
  show("parent-card");
  show("lead-card");
  setView("parent");

  document.title = "Bilan pédagogique — Ki'Savan";
  $("header-eyebrow").textContent = "Espace parents";
  $("page-title").textContent = "Comprendre pour mieux progresser";
  $("subtitle").textContent = `${data.result.quiz.title} · Niveau ${data.result.quiz.level}`;
  $("parent-result-title").textContent = "Résultat transmis par votre enfant";
  $("parent-result-score").textContent = `${data.result.score}/${data.result.total}`;
  $("parent-result-context").textContent = `${data.result.quiz.subjectLabel} · ${data.result.durationSeconds} secondes`;
  renderSkillSummary(state.skillSummary, "parent");
  $("lead-context-text").textContent = "Indiquez votre prénom et votre e-mail pour recevoir l’analyse détaillée associée à ce résultat.";
  void trackEvent("lead_form_viewed", { source: "parent_share" });
}

function appendAttemptCredentials(payload) {
  if (state.parentMode && state.parentShareToken) {
    payload.shareToken = state.parentShareToken;
  } else {
    payload.attemptId = state.attemptId;
    payload.attemptToken = state.attemptToken;
  }
  return payload;
}

export async function submitLead(event) {
  event.preventDefault();

  const hasDirectAttempt = state.attemptId && state.attemptToken;
  const hasSharedAttempt = state.parentMode && state.parentShareToken;
  if (!hasDirectAttempt && !hasSharedAttempt) {
    setStatus("lead-message", "Participation introuvable. Rechargez le lien ou refaites le quiz.", "error");
    return;
  }

  $("lead-submit").disabled = true;
  $("lead-submit").textContent = "Enregistrement...";
  setStatus("lead-message", "", "");

  const payload = appendAttemptCredentials({
    mode: "lead",
    parentName: $("parent-name").value,
    parentEmail: $("parent-email").value,
    mainConcern: $("main-concern").value,
    emailMarketingConsent: $("email-consent").checked,
    sessionId: getSessionId(),
    ctaVariant: getCtaVariant()
  });

  try {
    await api("/api/lead", { method: "POST", body: JSON.stringify(payload) });
    $("lead-form").classList.add("hidden");
    show("lead-success-panel");
    setStatus("lead-message", "", "");
  } catch (error) {
    setStatus("lead-message", error.message, "error");
    $("lead-submit").disabled = false;
    $("lead-submit").textContent = "Recevoir l’analyse gratuite";
  }
}

export async function submitCallbackRequest(event) {
  event.preventDefault();
  const phone = $("callback-phone").value.trim();
  const preferredContactTime = $("preferred-contact-time").value;

  if (!phone) {
    setStatus("callback-message", "Ajoutez votre numéro de téléphone.", "error");
    return;
  }

  $("callback-submit").disabled = true;
  $("callback-submit").textContent = "Enregistrement...";

  const payload = appendAttemptCredentials({
    mode: "callback",
    parentPhone: phone,
    preferredContactTime,
    sessionId: getSessionId(),
    ctaVariant: getCtaVariant()
  });

  try {
    await api("/api/lead", { method: "POST", body: JSON.stringify(payload) });
    $("callback-form").classList.add("hidden");
    setStatus("callback-message", "Votre demande de rappel est enregistrée.", "success");
  } catch (error) {
    setStatus("callback-message", error.message, "error");
    $("callback-submit").disabled = false;
    $("callback-submit").textContent = "Demander un échange gratuit";
  }
}

function bindEvents() {
  $("start-btn").onclick = () => {
    if (!state.questions.length || localStorage.getItem(attemptKey())) return;
    hide("start-card");
    show("quiz-card");
    setView("quiz");
    renderQuestion();
    startTimer();
    void trackEvent("quiz_started");
  };

  $("next-btn").onclick = async () => {
    if (state.index < state.questions.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      await submitQuiz();
    }
  };

  $("lead-form")?.addEventListener("submit", submitLead);
  $("callback-form")?.addEventListener("submit", submitCallbackRequest);
  $("share-parent-btn").onclick = shareParentResult;
  $("share-challenge-btn").onclick = shareChallenge;
  $("show-lead-form-btn").onclick = showLeadForm;
  $("skip-callback-btn").onclick = () => {
    $("appointment-box").classList.add("hidden");
    setStatus("callback-message", "Le bilan sera envoyé par e-mail.", "success");
  };
}

export function initApp() {
  getSessionId();
  getCtaVariant();
  bindEvents();

  const shareToken = new URLSearchParams(window.location.search).get("bilan");
  if (shareToken) {
    loadSharedResult(shareToken).catch((error) => {
      hide("start-card");
      hide("lead-card");
      show("parent-card");
      setView("parent");
      $("parent-result-title").textContent = "Lien de bilan invalide";
      $("parent-result-score").textContent = "—";
      $("parent-result-context").textContent = error.message;
    });
    return;
  }

  loadQuiz().catch((error) => {
    setView("start");
    $("subtitle").textContent = error.message;
  });
}
