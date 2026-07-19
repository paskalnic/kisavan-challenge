import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_QUIZ_SLUG,
  api,
  applyCtaVariant,
  buildChallengeUrl,
  buildParentResultUrl,
  copyText,
  ensureParentShareToken,
  getCtaVariant,
  hide,
  initApp,
  loadQuiz,
  loadSharedResult,
  renderQuestion,
  renderSkillSummary,
  shareOrCopy,
  shareParentResult,
  show,
  state,
  submitCallbackRequest,
  submitLead
} from "../app.module.js";

const ATTEMPT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ATTEMPT_TOKEN = "123e4567-e89b-12d3-a456-426614174001";
const SHARE_TOKEN = "123e4567-e89b-12d3-a456-426614174002";
const QUIZ = {
  id: ATTEMPT_ID,
  slug: ACTIVE_QUIZ_SLUG,
  title: "Diagnostic français 5e",
  week_label: "10 questions",
  level: "5e",
  subject: "francais"
};
const SKILLS = [
  { code: "lecture", label: "Compréhension", correct: 2, total: 2, percentage: 100 },
  { code: "accords", label: "Accords", correct: 0, total: 2, percentage: 0 },
  { code: "grammaire", label: "Grammaire", correct: 1, total: 2, percentage: 50 }
];

const html = readFileSync(`${process.cwd()}/public/index.html`, "utf8");
const bodyMarkup = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1];

function jsonResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  });
}

function renderAppFixture() {
  document.body.innerHTML = bodyMarkup;
  document.body.dataset.view = "loading";
}

function resetState() {
  clearInterval(state.timerId);
  Object.assign(state, {
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
  });
}

function installFetchRouter(routes = {}) {
  global.fetch = vi.fn((input, options = {}) => {
    const url = String(input);
    if (url === "/api/event") return jsonResponse({ ok: true }, 201);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        return typeof handler === "function" ? handler(url, options) : jsonResponse(handler);
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("public app module", () => {
  beforeEach(() => {
    renderAppFixture();
    resetState();
    localStorage.clear();
    localStorage.setItem("kisavan_cta_variant", "A");
    history.replaceState({}, "", "/");
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });

  afterEach(() => {
    clearInterval(state.timerId);
    vi.useRealTimers();
  });

  it("api returns JSON and preserves custom headers", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const data = await api("/api/test", { method: "POST", headers: { "X-Test": "yes" } });
    expect(data).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test": "yes" }
    });
  });

  it("restores a completed diagnostic including skills", async () => {
    localStorage.setItem(`kisavan_attempt_${ATTEMPT_ID}`, JSON.stringify({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      alias: "Colibri-321",
      score: 3,
      total: 5,
      durationMs: 28000,
      skillSummary: SKILLS
    }));
    installFetchRouter({ "/api/quiz": { quiz: QUIZ, questions: [{ id: "q1", prompt: "Question", choices: ["A", "B"] }] } });

    await loadQuiz();
    expect(document.body.dataset.view).toBe("result");
    expect(document.getElementById("result-score-number").textContent).toBe("3/5");
    expect(document.getElementById("result-strengths").textContent).toContain("Compréhension");
  });

  it("loads only the quiz imposed by the active slug", async () => {
    installFetchRouter({ "/api/quiz": { quiz: QUIZ, questions: [{ id: "q1", prompt: "Question", choices: ["A", "B"] }] } });
    await loadQuiz();
    expect(state.quizId).toBe(ATTEMPT_ID);
    expect(fetch.mock.calls[0][0]).toBe(`/api/quiz?slug=${encodeURIComponent(ACTIVE_QUIZ_SLUG)}`);
    expect(document.getElementById("subtitle").textContent).toContain("Diagnostic français 5e");
  });

  it("renders answer feedback and records the selected answer", () => {
    installFetchRouter();
    state.quizId = ATTEMPT_ID;
    state.questions = [{
      id: "q1",
      prompt: "Quelle réponse ?",
      choices: ["A", "B", "C"],
      correct_index: 1,
      explanation: "B est la bonne réponse.",
      skill_code: "lecture"
    }];

    renderQuestion();
    document.getElementById("answers").children[0].click();
    expect(state.answers.q1).toBe(0);
    expect(document.getElementById("answers").children[0].classList.contains("incorrect")).toBe(true);
    expect(document.getElementById("answers").children[1].classList.contains("correct")).toBe(true);
    expect(document.getElementById("explanation-text").textContent).toContain("bonne réponse");
  });

  it("renders the strongest and weakest skills separately", () => {
    renderSkillSummary(SKILLS, "result");
    expect(document.getElementById("result-strengths").textContent).toContain("Compréhension");
    expect(document.getElementById("result-focus").textContent).toContain("Accords");
  });

  it("show and hide toggle cards", () => {
    show("quiz-card");
    expect(document.getElementById("quiz-card").classList.contains("hidden")).toBe(false);
    hide("quiz-card");
    expect(document.getElementById("quiz-card").classList.contains("hidden")).toBe(true);
  });

  it("builds social-preview URLs rather than raw query links", () => {
    expect(buildChallengeUrl()).toBe("http://localhost:3000/partage/challenge");
    expect(buildParentResultUrl(SHARE_TOKEN)).toBe(`http://localhost:3000/bilan/${SHARE_TOKEN}`);
  });

  it("keeps one CTA variant per visitor", () => {
    localStorage.setItem("kisavan_cta_variant", "B");
    state.ctaVariant = null;
    expect(getCtaVariant()).toBe("B");
    applyCtaVariant();
    expect(document.getElementById("parent-action-heading").textContent).toBe("Comprendre mes erreurs");
  });

  it("creates and caches the parent share token", async () => {
    state.attemptId = ATTEMPT_ID;
    state.attemptToken = ATTEMPT_TOKEN;
    installFetchRouter({ "/api/share": { shareToken: SHARE_TOKEN } });
    await expect(ensureParentShareToken()).resolves.toBe(SHARE_TOKEN);
    await expect(ensureParentShareToken()).resolves.toBe(SHARE_TOKEN);
    expect(fetch.mock.calls.filter(([url]) => url === "/api/share")).toHaveLength(1);
  });

  it("uses the native mobile share menu when available", async () => {
    const nativeShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: nativeShare });
    const result = await shareOrCopy({ title: "Titre", text: "Texte", url: "https://example.com" });
    expect(result).toBe("shared");
    expect(nativeShare).toHaveBeenCalledWith({ title: "Titre", text: "Texte", url: "https://example.com" });
  });

  it("copies the URL only as a fallback when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await copyText("https://example.com/bilan");
    const result = await shareOrCopy({ title: "Titre", text: "Texte", url: "https://example.com/challenge" });
    expect(result).toBe("copied");
    expect(writeText).toHaveBeenLastCalledWith("https://example.com/challenge");
  });

  it("shares a natural child-to-parent message", async () => {
    state.quizId = ATTEMPT_ID;
    state.attemptId = ATTEMPT_ID;
    state.attemptToken = ATTEMPT_TOKEN;
    const nativeShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: nativeShare });
    installFetchRouter({ "/api/share": { shareToken: SHARE_TOKEN } });

    await shareParentResult();
    const sharePayload = nativeShare.mock.calls[0][0];
    expect(sharePayload.text).toContain("Peux-tu regarder mon résultat");
    expect(sharePayload.url).toContain(`/bilan/${SHARE_TOKEN}`);
  });

  it("submits only the short parent form and reveals the appointment step", async () => {
    state.attemptId = ATTEMPT_ID;
    state.attemptToken = ATTEMPT_TOKEN;
    document.getElementById("parent-name").value = "Marie";
    document.getElementById("parent-email").value = "marie@example.com";
    document.getElementById("main-concern").value = "confiance";
    installFetchRouter({ "/api/lead": { ok: true } });

    await submitLead({ preventDefault: vi.fn() });
    const call = fetch.mock.calls.find(([url]) => url === "/api/lead");
    const payload = JSON.parse(call[1].body);
    expect(payload).toEqual(expect.objectContaining({
      mode: "lead",
      parentName: "Marie",
      parentEmail: "marie@example.com",
      mainConcern: "confiance"
    }));
    expect(payload).not.toHaveProperty("parentPhone");
    expect(payload).not.toHaveProperty("postalCode");
    expect(document.getElementById("lead-success-panel").classList.contains("hidden")).toBe(false);
  });

  it("submits the callback as a separate second commitment", async () => {
    state.attemptId = ATTEMPT_ID;
    state.attemptToken = ATTEMPT_TOKEN;
    document.getElementById("callback-phone").value = "0600000000";
    document.getElementById("preferred-contact-time").value = "soir";
    installFetchRouter({ "/api/lead": { ok: true } });

    await submitCallbackRequest({ preventDefault: vi.fn() });
    const payload = JSON.parse(fetch.mock.calls.find(([url]) => url === "/api/lead")[1].body);
    expect(payload).toEqual(expect.objectContaining({
      mode: "callback",
      parentPhone: "0600000000",
      preferredContactTime: "soir"
    }));
    expect(document.getElementById("callback-message").textContent).toContain("enregistrée");
  });

  it("opens a visually distinct parent page with the skill preview", async () => {
    installFetchRouter({
      "/api/shared-result": {
        result: {
          attemptId: ATTEMPT_ID,
          alias: "Colibri-123",
          score: 4,
          total: 5,
          durationSeconds: 32,
          skillSummary: SKILLS,
          quiz: { title: "Français", weekLabel: "Diagnostic", level: "5e", subjectLabel: "Français" }
        }
      }
    });

    await loadSharedResult(SHARE_TOKEN);
    expect(document.body.dataset.view).toBe("parent");
    expect(document.getElementById("page-title").textContent).toBe("Comprendre pour mieux progresser");
    expect(document.getElementById("parent-result-score").textContent).toBe("4/5");
    expect(document.getElementById("parent-focus").textContent).toContain("Accords");
  });

  it("initializes all current actions without references to the removed leaderboard", async () => {
    installFetchRouter({ "/api/quiz": { quiz: QUIZ, questions: [{ id: "q1", prompt: "Q1", choices: ["A", "B"] }] } });
    initApp();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(typeof document.getElementById("start-btn").onclick).toBe("function");
    expect(typeof document.getElementById("share-parent-btn").onclick).toBe("function");
    expect(typeof document.getElementById("skip-callback-btn").onclick).toBe("function");
    expect(document.getElementById("leaderboard-card")).toBeNull();
  });
});
