export const state = {
  quizId: null,
  questions: [],
  answers: {},
  index: 0,
  startedAt: null,
  timerId: null,
  attemptId: null,
  attemptToken: null
};

export const $ = (id) => document.getElementById(id);
export const attemptKey = () => `kisavan_attempt_${state.quizId}`;

export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }
  return data;
}

export const show = (id) => {
  const el = $(id);
  el.classList.remove("hidden");
  if (el.classList.contains("card")) {
    el.classList.remove("animate-in");
    requestAnimationFrame(() => el.classList.add("animate-in"));
  }
};

export const hide = (id) => {
  const el = $(id);
  el.classList.add("hidden");
  el.classList.remove("animate-in");
};

let audioContext;
function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext) {
    audioContext = new AudioCtx();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  }
  return audioContext;
}

function playTone(frequency, duration = 0.14, type = "sine") {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
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
  card.classList.remove("hidden");
  card.classList.add("visible");
}

export function hideExplanation() {
  const card = $("explanation-card");
  card.classList.remove("visible");
  setTimeout(() => card.classList.add("hidden"), 260);
}

export function animateQuizCard() {
  const card = $("quiz-card");
  if (!card) return;
  card.classList.remove("card-pulse");
  void card.offsetWidth;
  card.classList.add("card-pulse");
}

export async function loadQuiz() {
  const level = $("level").value;
  const subject = $("subject").value;
  const data = await api(
    `/api/quiz?level=${encodeURIComponent(level)}&subject=${encodeURIComponent(subject)}`
  );

  state.quizId = data.quiz.id;
  state.questions = data.questions;
  $("subtitle").textContent = `${data.quiz.title} - ${data.quiz.week_label}`;

  if (localStorage.getItem(attemptKey())) {
    $("start-btn").disabled = true;
    $("start-btn").textContent = "Déjà participé sur cet appareil";
  }
}

export function renderQuestion() {
  const question = state.questions[state.index];
  const selectedIndex = state.answers[question.id];
  const hasAnswered = selectedIndex !== undefined;
  const correctIndex = question.correct_index;

  $("progress").textContent = `Question ${state.index + 1}/${state.questions.length}`;
  $("question-text").textContent = question.prompt;
  $("answers").innerHTML = "";
  $("next-btn").disabled = !hasAnswered;

  question.choices.forEach((choice, index) => {
    const button = document.createElement("button");
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
      setTimeout(() => {
        $("question-text").classList.remove("question-pop");
      }, 280);
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

  animateQuizCard();
}

export function startTimer() {
  state.startedAt = Date.now();
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

    state.attemptId = result.attemptId;
    state.attemptToken = result.attemptToken;
    localStorage.setItem(attemptKey(), result.attemptToken);

    hide("quiz-card");
    show("result-card");
    $("result-text").textContent = `Score : ${result.score}/${result.total} - ${Math.round(result.durationMs / 1000)} secondes.`;
    $("alias-text").textContent = `Ton surnom : ${result.alias}`;
    await loadLeaderboard();
  } catch (error) {
    alert(error.message);
    $("next-btn").disabled = false;
    $("next-btn").textContent = "Réessayer";
  }
}

export async function submitLead(event) {
  event.preventDefault();

  if (!state.attemptId || !state.attemptToken) {
    $("lead-message").textContent = "Participation introuvable. Recharge la page et refais le quiz.";
    return;
  }

  const callbackRequested = $("callback-requested").checked;
  const parentPhone = $("parent-phone").value.trim();

  if (callbackRequested && !parentPhone) {
    $("lead-message").textContent = "Ajoute un numéro de téléphone pour demander un rappel.";
    $("parent-phone").focus();
    return;
  }

  $("lead-submit").disabled = true;
  $("lead-submit").textContent = "Enregistrement...";
  $("lead-message").textContent = "";

  try {
    await api("/api/lead", {
      method: "POST",
      body: JSON.stringify({
        attemptId: state.attemptId,
        attemptToken: state.attemptToken,
        parentName: $("parent-name").value,
        parentEmail: $("parent-email").value,
        parentPhone,
        postalCode: $("postal-code").value.trim(),
        childLevel: $("child-level").value,
        mainDifficulty: $("main-difficulty").value,
        callbackRequested,
        emailMarketingConsent: $("email-consent").checked
      })
    });

    $("lead-message").textContent = "Demande enregistrée. Vous serez contacté(e).";
    $("lead-form").reset();
  } catch (error) {
    $("lead-message").textContent = error.message;
  } finally {
    $("lead-submit").disabled = false;
    $("lead-submit").textContent = "Demander mon bilan gratuit";
  }
}

export async function loadLeaderboard() {
  if (!state.quizId) return;

  const data = await api(`/api/leaderboard?quizId=${encodeURIComponent(state.quizId)}`);
  const list = $("leaderboard");
  list.innerHTML = "";
  $("board-empty").classList.toggle("hidden", data.entries.length > 0);

  data.entries.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = `${entry.alias} - ${entry.score}/${entry.total} - ${entry.duration_seconds}s`;
    list.appendChild(item);
  });
}

export function initApp() {
  $("start-btn").onclick = async () => {
    await loadQuiz();
    if (localStorage.getItem(attemptKey())) return;
    hide("start-card");
    show("quiz-card");
    renderQuestion();
    startTimer();
  };

  $("next-btn").onclick = async () => {
    if (state.index < state.questions.length - 1) {
      state.index++;
      renderQuestion();
    } else {
      await submitQuiz();
    }
  };

  $("lead-form").addEventListener("submit", submitLead);
  $("refresh-btn").onclick = loadLeaderboard;
  $("show-board-btn").onclick = async () => {
    show("leaderboard-card");
    $("leaderboard-card").scrollIntoView({ behavior: "smooth" });
  };

  loadQuiz().catch((error) => {
    $("subtitle").textContent = error.message;
  });
}
