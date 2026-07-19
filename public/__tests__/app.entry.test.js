import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function renderEntryFixture() {
  document.body.innerHTML = `
    <div id="subtitle"></div>
    <section id="start-card"></section>
    <button id="start-btn"></button>
    <select id="level"><option value="5e">5e</option></select>
    <select id="subject"><option value="maths">Mathématiques</option></select>
    <button id="next-btn"></button>
    <div id="question-text"></div>
    <div id="answers"></div>
    <details id="explanation-card" class="hidden"><p id="explanation-text"></p></details>
    <div id="progress"></div>
    <div id="timer"></div>
    <div id="quiz-card" class="card hidden"></div>
    <div id="result-card" class="card hidden"></div>
    <div id="parent-card" class="card hidden"></div>
    <div id="lead-card" class="card hidden"></div>
    <div id="leaderboard-card" class="card hidden"></div>
    <form id="lead-form"></form>
    <button id="lead-submit"></button>
    <button id="share-parent-btn"></button>
    <button id="copy-parent-link-btn"></button>
    <button id="share-challenge-btn"></button>
    <button id="show-lead-form-btn"></button>
    <button id="refresh-btn"></button>
    <button id="show-board-btn"></button>
    <div id="board-empty"></div>
    <ol id="leaderboard"></ol>
  `;
}

describe("public app entry", () => {
  beforeEach(() => {
    renderEntryFixture();
    localStorage.clear();
    history.replaceState({}, "", "/");
    vi.resetModules();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quiz: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          title: "Super Quiz",
          week_label: "Semaine 1"
        },
        questions: [{ id: "q1", prompt: "Quelle est 1+1 ?", choices: ["1", "2"] }]
      })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports app.js and initializes the complete entry point", async () => {
    await import("../app.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).toHaveBeenCalledWith(
      "/api/quiz?level=5e&subject=maths",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } })
    );
    expect(typeof document.getElementById("start-btn").onclick).toBe("function");
    expect(document.getElementById("subtitle").textContent).toContain("Super Quiz");
  });
});
