import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("public app entry", () => {
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
      <form id="lead-form"></form>
      <button id="lead-submit"></button>
      <button id="refresh-btn"></button>
      <button id="show-board-btn"></button>
      <div id="board-empty"></div>
      <ol id="leaderboard"></ol>
    `;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quiz: { id: "quiz-1", title: "Super Quiz", week_label: "Semaine 1" },
        questions: [{ id: "q1", prompt: "Quelle est 1+1 ?", choices: ["1", "2"] }]
      })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports app.js without runtime failure and initializes event handlers", async () => {
    await import("../app.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).toHaveBeenCalledWith(
      "/api/quiz?level=5e&subject=maths",
      expect.any(Object)
    );
    expect(typeof document.getElementById("start-btn").onclick).toBe("function");
    expect(document.getElementById("subtitle").textContent).toContain("Super Quiz");
  });
});
