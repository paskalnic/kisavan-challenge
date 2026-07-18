import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  loadQuiz,
  renderQuestion,
  submitLead,
  show,
  hide,
  state
} from "../app.module.js";

describe("public app module", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="subtitle"></div>
      <button id="start-btn"></button>
      <select id="level"><option value="5e">5e</option></select>
      <select id="subject"><option value="maths">Mathématiques</option></select>
      <button id="next-btn"></button>
      <div id="question-text"></div>
      <div id="answers"></div>
      <div id="explanation-card" class="explanation-card hidden">
        <h3>Explications</h3>
        <p id="explanation-text"></p>
      </div>
      <div id="progress"></div>
      <div id="timer"></div>
      <div id="quiz-card" class="card hidden"></div>
      <div id="result-card" class="card hidden"></div>
      <input id="callback-requested" type="checkbox" />
      <input id="parent-phone" />
      <div id="lead-message"></div>
      <form id="lead-form"></form>
      <button id="lead-submit"></button>
      <div id="board-empty"></div>
      <ol id="leaderboard"></ol>
    `;

    state.quizId = null;
    state.questions = [];
    state.answers = {};
    state.index = 0;
    state.startedAt = null;
    state.timerId = null;
    state.attemptId = null;
    state.attemptToken = null;

    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("api returns JSON data for successful responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });

    const data = await api("/api/test");
    expect(data).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith("/api/test", {
      headers: { "Content-Type": "application/json" },
      method: undefined
    });
  });

  it("api throws when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "oops" })
    });

    await expect(api("/api/test")).rejects.toThrow("oops");
  });

  it("loadQuiz updates state and subtitle text", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quiz: { id: "quiz-1", title: "Super Quiz", week_label: "Semaine 1" },
        questions: [{ id: "q1", prompt: "Quelle est la couleur du ciel ?", choices: ["Bleu", "Vert"] }]
      })
    });

    await loadQuiz();
    expect(state.quizId).toBe("quiz-1");
    expect(state.questions).toHaveLength(1);
    expect(document.getElementById("subtitle").textContent).toContain("Super Quiz");
  });

  it("renderQuestion creates answer buttons and disables next when unanswered", () => {
    state.questions = [
      { id: "q1", prompt: "Quelle est la somme de 1+1 ?", choices: ["1", "2", "3"] }
    ];
    state.index = 0;
    state.answers = {};

    renderQuestion();

    expect(document.getElementById("progress").textContent).toBe("Question 1/1");
    expect(document.getElementById("answers").children.length).toBe(3);
    expect(document.getElementById("next-btn").disabled).toBe(true);
  });

  it("selecting an answer updates selection state and enables next", () => {
    state.questions = [
      { id: "q1", prompt: "Quelle est la somme de 1+1 ?", choices: ["1", "2", "3"] }
    ];
    state.index = 0;
    state.answers = {};

    renderQuestion();

    const secondAnswer = document.getElementById("answers").children[1];
    secondAnswer.click();

    expect(state.answers.q1).toBe(1);
    const selectedAnswer = Array.from(document.getElementById("answers").children).find((button) =>
      button.classList.contains("selected")
    );
    expect(selectedAnswer).toBeTruthy();
    expect(selectedAnswer.textContent).toBe("2");
    expect(document.getElementById("next-btn").disabled).toBe(false);
  });

  it("shows explanation and highlights correct and incorrect answers", async () => {
    state.questions = [
      {
        id: "q1",
        prompt: "Quelle est la somme de 1+1 ?",
        choices: ["1", "2", "3"],
        correct_index: 1,
        explanation: "2 est la bonne réponse car 1+1 = 2."
      }
    ];
    state.index = 0;
    state.answers = {};

    renderQuestion();
    const wrongAnswer = document.getElementById("answers").children[0];
    wrongAnswer.click();

    const buttons = Array.from(document.getElementById("answers").children);
    expect(buttons[0].classList.contains("incorrect")).toBe(true);
    expect(buttons[1].classList.contains("correct")).toBe(true);

    const explanationCard = document.getElementById("explanation-card");
    expect(explanationCard.classList.contains("hidden")).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(explanationCard.classList.contains("visible")).toBe(true);
    expect(document.getElementById("explanation-text").textContent).toBe("2 est la bonne réponse car 1+1 = 2.");
  });

  it("show and hide toggle hidden class", () => {
    const card = document.getElementById("quiz-card");
    show("quiz-card");
    expect(card.classList.contains("hidden")).toBe(false);

    hide("quiz-card");
    expect(card.classList.contains("hidden")).toBe(true);
  });

  it("submitLead displays an error when no attempt is available", async () => {
    const event = { preventDefault: vi.fn() };

    await submitLead(event);
    expect(document.getElementById("lead-message").textContent).toBe(
      "Participation introuvable. Recharge la page et refais le quiz."
    );
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
