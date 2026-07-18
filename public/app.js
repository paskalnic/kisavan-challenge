const state = {
  quizId: null,
  questions: [],
  answers: {},
  index: 0,
  startedAt: null,
  timerId: null,
  attemptId: null,
  attemptToken: null
};

const $ = (id) => document.getElementById(id);
const attemptKey = () => `kisavan_attempt_${state.quizId}`;

async function api(path, options = {}) {
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

const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");

async function loadQuiz() {
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

function renderQuestion() {
  const question = state.questions[state.index];
  $("progress").textContent = `Question ${state.index + 1}/${state.questions.length}`;
  $("question-text").textContent = question.prompt;
  $("answers").innerHTML = "";
  $("next-btn").disabled = state.answers[question.id] === undefined;

  question.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.className = "answer";
    button.textContent = choice;

    if (state.answers[question.id] === index) {
      button.classList.add("selected");
    }

    button.onclick = () => {
      state.answers[question.id] = index;
      renderQuestion();
    };

    $("answers").appendChild(button);
  });

  $("next-btn").textContent =
    state.index === state.questions.length - 1
      ? "Envoyer mes réponses"
      : "Question suivante";
}

function startTimer() {
  state.startedAt = Date.now();
  state.timerId = setInterval(() => {
    const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
    $("timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }, 250);
}

async function submitQuiz() {
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

async function submitLead(event) {
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
        childLevel: $("child-level").value,
        mainDifficulty: $("main-difficulty").value,
        callbackRequested,
        emailMarketingConsent: $("email-consent").checked
      })
    });

    $("lead-message").textContent = "Demande enregistrée. Vous serez contacté(e) avec les informations indiquées.";
    $("lead-form").reset();
  } catch (error) {
    $("lead-message").textContent = error.message;
  } finally {
    $("lead-submit").disabled = false;
    $("lead-submit").textContent = "Demander mon bilan gratuit";
  }
}

async function loadLeaderboard() {
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
