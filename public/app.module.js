export const state = {
  quizId: null,
  questions: [],
  answers: {},
  index: 0,
  startedAt: null,
  timerId: null,
  attemptId: null,
  attemptToken: null,
  parentShareToken: null,
  parentMode: false,
  sharedResult: null
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
  if (status) {
    element.dataset.status = status;
  } else {
    delete element.dataset.status;
  }
}

let audioContext;
function getAudioContext() {
  if (typeof window === "undefined") return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContext) {
    audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
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
      return stored;
    }
  } catch {
    // Ancienne version : la valeur contenait uniquement le jeton de tentative.
  }

  return null;
}

export function displayResult(result) {
  state.attemptId = result.attemptId;
  state.attemptToken = result.attemptToken;
  state.parentShareToken = null;

  hide("start-card");
  hide("quiz-card");
  show("result-card");
  setView("result");

  $("result-text").textContent = `${result.score}/${result.total} bonnes réponses en ${Math.round(result.durationMs / 1000)} secondes.`;
  $("alias-text").textContent = `Surnom : ${result.alias}`;
}

export async function loadQuiz() {
  const level = $("level").value;
  const subject = $("subject").value;
  const data = await api(
    `/api/quiz?level=${encodeURIComponent(level)}&subject=${encodeURIComponent(subject)}`
  );

  state.quizId = data.quiz.id;
  state.questions = data.questions;
  state.answers = {};
  state.index = 0;
  $("subtitle").textContent = `${data.quiz.title} — ${data.quiz.week_label}`;
  setView("start");

  const storedValue = localStorage.getItem(attemptKey());
  const storedAttempt = readStoredAttempt();

  if (storedAttempt) {
    displayResult(storedAttempt);
    loadLeaderboard().catch(() => {});
    return;
  }

  if (storedValue) {
    $("start-btn").disabled = true;
    $("start-btn").textContent = "Déjà participé sur cet appareil";
  } else {
    $("start-btn").disabled = false;
    $("start-btn").textContent = "Commencer";
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

    if (selectedIndex === index) {
      button.classList.add("selected");
    }

    if (hasAnswered && typeof correctIndex === "number") {
      if (index === correctIndex) {
        button.classList.add("correct");
      } else if (index === selectedIndex) {
        button.classList.add("incorrect");
      }
    }

    button.onclick = () => {
      if (hasAnswered) return;

      state.answers[question.id] = index;
      const isCorrect = typeof correctIndex === "number" && index === correctIndex;
      playAnswerSound(isCorrect);

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

  $("next-btn").textContent =
    state.index === state.questions.length - 1
      ? "Envoyer mes réponses"
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
    durationMs: Date.now() - state.startedAt
  };

  $("next-btn").disabled = true;
  $("next-btn").textContent = "Envoi...";

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
      durationMs: result.durationMs
    };

    localStorage.setItem(attemptKey(), JSON.stringify(storedAttempt));
    displayResult(storedAttempt);

    loadLeaderboard().catch(() => {
      setStatus("board-empty", "Le classement est momentanément indisponible.", "error");
    });
  } catch (error) {
    setStatus("share-message", error.message, "error");
    $("next-btn").disabled = false;
    $("next-btn").textContent = "Réessayer";
  }
}

export function buildChallengeUrl() {
  return new URL(window.location.pathname || "/", window.location.origin).toString();
}

export function buildParentResultUrl(shareToken) {
  const url = new URL(window.location.pathname || "/", window.location.origin);
  url.searchParams.set("bilan", shareToken);
  return url.toString();
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
      shareType: "parent"
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

  if (!copied) {
    throw new Error("Impossible de copier automatiquement le lien.");
  }
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
  setStatus("share-message", "Préparation du lien...", "");
  $("share-parent-btn").disabled = true;

  try {
    const shareToken = await ensureParentShareToken();
    const result = await shareOrCopy({
      title: "Bilan du challenge Ki'Savan",
      text: "J'ai terminé le challenge Ki'Savan. Tu peux consulter mon résultat et demander mon bilan pédagogique.",
      url: buildParentResultUrl(shareToken)
    });

    if (result === "copied") {
      setStatus("share-message", "Lien du bilan copié. Tu peux maintenant l'envoyer à un parent.", "success");
    } else if (result === "shared") {
      setStatus("share-message", "Lien du bilan partagé.", "success");
    } else {
      setStatus("share-message", "Partage annulé.", "");
    }
  } catch (error) {
    setStatus("share-message", error.message, "error");
  } finally {
    $("share-parent-btn").disabled = false;
  }
}

export async function copyParentResultLink() {
  setStatus("share-message", "Préparation du lien...", "");
  $("copy-parent-link-btn").disabled = true;

  try {
    const shareToken = await ensureParentShareToken();
    await copyText(buildParentResultUrl(shareToken));
    setStatus("share-message", "Lien du bilan copié.", "success");
  } catch (error) {
    setStatus("share-message", error.message, "error");
  } finally {
    $("copy-parent-link-btn").disabled = false;
  }
}

export async function shareChallenge() {
  $("share-challenge-btn").disabled = true;

  try {
    const result = await shareOrCopy({
      title: "Challenge Ki'Savan",
      text: "J'ai fait le challenge Ki'Savan. À ton tour de relever le défi !",
      url: buildChallengeUrl()
    });

    if (result === "copied") {
      setStatus("share-message", "Lien du challenge copié.", "success");
    } else if (result === "shared") {
      setStatus("share-message", "Challenge partagé.", "success");
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
  $("lead-context-text").textContent = "Laissez vos coordonnées pour recevoir un retour personnalisé sur les réponses du quiz.";
  show("lead-card");

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

  hide("start-card");
  hide("quiz-card");
  hide("result-card");
  hide("leaderboard-card");
  show("parent-card");
  show("lead-card");
  setView("parent");

  $("subtitle").textContent = `${data.result.quiz.title} — ${data.result.quiz.weekLabel}`;
  $("parent-result-title").textContent = `Résultat de ${data.result.alias}`;
  $("parent-result-text").textContent = `${data.result.score}/${data.result.total} bonnes réponses en ${data.result.durationSeconds} secondes.`;
  $("parent-result-context").textContent = `Niveau ${data.result.quiz.level} · ${data.result.quiz.subjectLabel}`;
  $("lead-context-text").textContent = "Indiquez vos coordonnées pour recevoir le bilan associé à ce résultat.";
}

export async function submitLead(event) {
  event.preventDefault();

  const hasDirectAttempt = state.attemptId && state.attemptToken;
  const hasSharedAttempt = state.parentMode && state.parentShareToken;

  if (!hasDirectAttempt && !hasSharedAttempt) {
    setStatus("lead-message", "Participation introuvable. Rechargez le lien ou refaites le quiz.", "error");
    return;
  }

  const callbackRequested = $("callback-requested").checked;
  const parentPhone = $("parent-phone").value.trim();

  if (callbackRequested && !parentPhone) {
    setStatus("lead-message", "Ajoutez un numéro de téléphone pour demander un rappel.", "error");
    $("parent-phone").focus();
    return;
  }

  $("lead-submit").disabled = true;
  $("lead-submit").textContent = "Enregistrement...";
  setStatus("lead-message", "", "");

  const payload = {
    parentName: $("parent-name").value,
    parentEmail: $("parent-email").value,
    parentPhone,
    postalCode: $("postal-code").value.trim(),
    callbackRequested,
    emailMarketingConsent: $("email-consent").checked
  };

  if (hasSharedAttempt) {
    payload.shareToken = state.parentShareToken;
  } else {
    payload.attemptId = state.attemptId;
    payload.attemptToken = state.attemptToken;
  }

  let success = false;
  try {
    await api("/api/lead", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    success = true;
    setStatus("lead-message", "Demande enregistrée. Le bilan sera envoyé à cette adresse e-mail.", "success");
    $("lead-form").reset();
    $("lead-submit").textContent = "Demande envoyée";
  } catch (error) {
    setStatus("lead-message", error.message, "error");
  } finally {
    if (!success) {
      $("lead-submit").disabled = false;
      $("lead-submit").textContent = "Recevoir mon bilan gratuit";
    }
  }
}

export async function loadLeaderboard() {
  if (!state.quizId) return;

  const data = await api(`/api/leaderboard?quizId=${encodeURIComponent(state.quizId)}`);
  const list = $("leaderboard");
  list.replaceChildren();
  $("board-empty").classList.toggle("hidden", data.entries.length > 0);

  data.entries.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = `${entry.alias} — ${entry.score}/${entry.total} — ${entry.duration_seconds}s`;
    list.appendChild(item);
  });
}

function bindEvents() {
  $("start-btn").onclick = async () => {
    try {
      await loadQuiz();
      if (localStorage.getItem(attemptKey())) return;

      hide("start-card");
      show("quiz-card");
      setView("quiz");
      renderQuestion();
      startTimer();
    } catch (error) {
      $("subtitle").textContent = error.message;
    }
  };

  $("next-btn").onclick = async () => {
    if (state.index < state.questions.length - 1) {
      state.index++;
      renderQuestion();
    } else {
      await submitQuiz();
    }
  };

  $("lead-form")?.addEventListener("submit", submitLead);

  const shareParentButton = $("share-parent-btn");
  if (shareParentButton) shareParentButton.onclick = shareParentResult;

  const copyParentButton = $("copy-parent-link-btn");
  if (copyParentButton) copyParentButton.onclick = copyParentResultLink;

  const shareChallengeButton = $("share-challenge-btn");
  if (shareChallengeButton) shareChallengeButton.onclick = shareChallenge;

  const showLeadButton = $("show-lead-form-btn");
  if (showLeadButton) showLeadButton.onclick = showLeadForm;

  const refreshButton = $("refresh-btn");
  if (refreshButton) refreshButton.onclick = () => loadLeaderboard().catch(() => {});

  $("show-board-btn").onclick = async () => {
    show("leaderboard-card");
    await loadLeaderboard().catch(() => {});
    const board = $("leaderboard-card");
    if (board && typeof board.scrollIntoView === "function") {
      board.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
}

export function initApp() {
  bindEvents();

  const shareToken = new URLSearchParams(window.location.search).get("bilan");
  if (shareToken) {
    loadSharedResult(shareToken).catch((error) => {
      hide("start-card");
      hide("lead-card");
      show("parent-card");
      setView("parent");
      $("parent-result-title").textContent = "Lien de bilan invalide";
      $("parent-result-text").textContent = error.message;
      $("parent-result-context").textContent = "Demandez un nouveau lien à la personne qui a réalisé le quiz.";
    });
    return;
  }

  loadQuiz().catch((error) => {
    setView("start");
    $("subtitle").textContent = error.message;
  });
}
