import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  buildChallengeUrl,
  buildParentResultUrl,
  copyText,
  ensureParentShareToken,
  hide,
  initApp,
  loadQuiz,
  loadSharedResult,
  renderQuestion,
  shareOrCopy,
  show,
  state,
  submitLead
} from "../app.module.js";

const ATTEMPT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ATTEMPT_TOKEN = "123e4567-e89b-12d3-a456-426614174001";
const SHARE_TOKEN = "123e4567-e89b-12d3-a456-426614174002";

function renderAppFixture() {
  document.body.innerHTML = `
    <div id="subtitle"></div>
    <section id="start-card" class="card"></section>
    <button id="start-btn"></button>
    <select id="level"><option value="5e">5e</option></select>
    <select id="subject"><option value="maths">Mathématiques</option></select>

    <section id="quiz-card" class="card hidden">
      <div id="progress"></div>
      <div id="timer"></div>
      <div class="question-scroll-area">
        <div id="question-text"></div>
        <div id="answers"></div>
        <details id="explanation-card" class="explanation-card hidden">
          <p id="explanation-text"></p>
        </details>
      </div>
      <button id="next-btn"></button>
    </section>

    <section id="result-card" class="card hidden">
      <div id="result-text"></div>
      <div id="alias-text"></div>
      <button id="share-parent-btn"></button>
      <button id="copy-parent-link-btn"></button>
      <button id="share-challenge-btn"></button>
      <button id="show-lead-form-btn"></button>
      <button id="show-board-btn"></button>
      <div id="share-message"></div>
    </section>

    <section id="parent-card" class="card hidden">
      <div id="parent-result-title"></div>
      <div id="parent-result-text"></div>
      <div id="parent-result-context"></div>
    </section>

    <section id="lead-card" class="card hidden">
      <div id="lead-context-text"></div>
      <form id="lead-form">
        <input id="parent-name" />
        <input id="parent-email" />
        <input id="parent-phone" />
        <input id="postal-code" />
        <input id="callback-requested" type="checkbox" />
        <input id="email-consent" type="checkbox" />
        <button id="lead-submit"></button>
      </form>
      <div id="lead-message"></div>
    </section>

    <section id="leaderboard-card" class="card hidden">
      <button id="refresh-btn"></button>
      <div id="board-empty"></div>
      <ol id="leaderboard"></ol>
    </section>
  `;
}

function resetState() {
  clearInterval(state.timerId);
  Object.assign(state, {
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
  });
}

describe("public app module", () => {
  beforeEach(() => {
    renderAppFixture();
    resetState();
    localStorage.clear();
    history.replaceState({}, "", "/");
    vi.restoreAllMocks();

    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined
    });
  });

  afterEach(() => {
    clearInterval(state.timerId);
    vi.useRealTimers();
  });

  it("api returns JSON and preserves custom headers", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });

    const data = await api("/api/test", {
      method: "POST",
      headers: { "X-Test": "yes" }
    });

    expect(data).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith("/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test": "yes"
      }
    });
  });

  it("api throws the API error when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Erreur test" })
    });

    await expect(api("/api/test")).rejects.toThrow("Erreur test");
  });

  it("restores a completed result after a page reload", async () => {
    const storedAttempt = {
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      alias: "Colibri-321",
      score: 3,
      total: 5,
      durationMs: 28000
    };
    localStorage.setItem(`kisavan_attempt_${ATTEMPT_ID}`, JSON.stringify(storedAttempt));

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quiz: { id: ATTEMPT_ID, title: "Super Quiz", week_label: "Semaine 1" },
          questions: [{ id: "q1", prompt: "Question", choices: ["A", "B"] }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: [] })
      });

    await loadQuiz();

    expect(state.attemptId).toBe(ATTEMPT_ID);
    expect(document.body.dataset.view).toBe("result");
    expect(document.getElementById("result-card").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("result-text").textContent).toContain("3/5");
  });

  it("loadQuiz updates state, subtitle and view", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quiz: { id: ATTEMPT_ID, title: "Super Quiz", week_label: "Semaine 1" },
        questions: [{ id: "q1", prompt: "Question", choices: ["A", "B"] }]
      })
    });

    await loadQuiz();

    expect(state.quizId).toBe(ATTEMPT_ID);
    expect(state.questions).toHaveLength(1);
    expect(document.getElementById("subtitle").textContent).toContain("Super Quiz");
    expect(document.body.dataset.view).toBe("start");
  });

  it("renderQuestion creates answers and enables next after a choice", () => {
    state.questions = [
      {
        id: "q1",
        prompt: "Quelle est la somme de 1+1 ?",
        choices: ["1", "2", "3"],
        correct_index: 1,
        explanation: "1 + 1 = 2."
      }
    ];

    renderQuestion();
    expect(document.getElementById("next-btn").disabled).toBe(true);
    expect(document.getElementById("answers").children).toHaveLength(3);

    document.getElementById("answers").children[0].click();

    expect(state.answers.q1).toBe(0);
    expect(document.getElementById("next-btn").disabled).toBe(false);
    expect(document.getElementById("answers").children[0].classList.contains("incorrect")).toBe(true);
    expect(document.getElementById("answers").children[1].classList.contains("correct")).toBe(true);
    expect(document.getElementById("explanation-card").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("explanation-text").textContent).toBe("1 + 1 = 2.");
  });

  it("show and hide toggle the hidden class", () => {
    show("quiz-card");
    expect(document.getElementById("quiz-card").classList.contains("hidden")).toBe(false);

    hide("quiz-card");
    expect(document.getElementById("quiz-card").classList.contains("hidden")).toBe(true);
  });

  it("builds clean challenge and parent URLs", () => {
    expect(buildChallengeUrl()).toBe("http://localhost:3000/");
    expect(buildParentResultUrl(SHARE_TOKEN)).toBe(
      `http://localhost:3000/?bilan=${SHARE_TOKEN}`
    );
  });

  it("creates a parent share token once and caches it", async () => {
    state.attemptId = ATTEMPT_ID;
    state.attemptToken = ATTEMPT_TOKEN;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ shareToken: SHARE_TOKEN })
    });

    await expect(ensureParentShareToken()).resolves.toBe(SHARE_TOKEN);
    await expect(ensureParentShareToken()).resolves.toBe(SHARE_TOKEN);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the native share menu when available", async () => {
    const nativeShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: nativeShare
    });

    const result = await shareOrCopy({
      title: "Titre",
      text: "Texte",
      url: "https://example.com"
    });

    expect(result).toBe("shared");
    expect(nativeShare).toHaveBeenCalledWith({
      title: "Titre",
      text: "Texte",
      url: "https://example.com"
    });
  });

  it("copies the URL when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    await copyText("https://example.com/bilan");
    const result = await shareOrCopy({
      title: "Titre",
      text: "Texte",
      url: "https://example.com/challenge"
    });

    expect(result).toBe("copied");
    expect(writeText).toHaveBeenLastCalledWith("https://example.com/challenge");
  });

  it("submitLead rejects a form without a linked attempt", async () => {
    const event = { preventDefault: vi.fn() };

    await submitLead(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.getElementById("lead-message").textContent).toContain("Participation introuvable");
  });

  it("submitLead sends only the light direct-result fields", async () => {
    state.attemptId = ATTEMPT_ID;
    state.attemptToken = ATTEMPT_TOKEN;
    document.getElementById("parent-name").value = "Marie";
    document.getElementById("parent-email").value = "marie@example.com";
    document.getElementById("postal-code").value = "75001";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });

    await submitLead({ preventDefault: vi.fn() });

    const request = global.fetch.mock.calls[0][1];
    const payload = JSON.parse(request.body);
    expect(payload).toEqual({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      parentName: "Marie",
      parentEmail: "marie@example.com",
      parentPhone: "",
      postalCode: "75001",
      callbackRequested: false,
      emailMarketingConsent: false
    });
    expect(payload).not.toHaveProperty("childLevel");
    expect(payload).not.toHaveProperty("mainDifficulty");
    expect(document.getElementById("lead-message").textContent).toContain("Demande enregistrée");
  });

  it("submitLead uses the share token on the parent page", async () => {
    state.parentMode = true;
    state.parentShareToken = SHARE_TOKEN;
    document.getElementById("parent-name").value = "Paul";
    document.getElementById("parent-email").value = "paul@example.com";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });

    await submitLead({ preventDefault: vi.fn() });

    const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(payload.shareToken).toBe(SHARE_TOKEN);
    expect(payload).not.toHaveProperty("attemptToken");
  });

  it("loadSharedResult opens the parent result and lead form", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          attemptId: ATTEMPT_ID,
          alias: "Colibri-123",
          score: 4,
          total: 5,
          durationSeconds: 32,
          quiz: {
            title: "Fractions",
            weekLabel: "Semaine 1",
            level: "5e",
            subjectLabel: "Mathématiques"
          }
        }
      })
    });

    await loadSharedResult(SHARE_TOKEN);

    expect(state.parentMode).toBe(true);
    expect(document.body.dataset.view).toBe("parent");
    expect(document.getElementById("parent-card").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("lead-card").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("parent-result-text").textContent).toContain("4/5");
  });

  it("initApp binds the new actions and loads the quiz", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quiz: { id: ATTEMPT_ID, title: "Super Quiz", week_label: "Semaine 1" },
        questions: [{ id: "q1", prompt: "Q1", choices: ["A", "B"] }]
      })
    });

    initApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(typeof document.getElementById("start-btn").onclick).toBe("function");
    expect(typeof document.getElementById("share-parent-btn").onclick).toBe("function");
    expect(typeof document.getElementById("copy-parent-link-btn").onclick).toBe("function");
    expect(document.getElementById("subtitle").textContent).toContain("Super Quiz");
  });
});
