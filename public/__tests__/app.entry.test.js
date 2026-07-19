import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(`${process.cwd()}/public/index.html`, "utf8");
const bodyMarkup = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1];

function response(data, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => data });
}

describe("public app entry", () => {
  beforeEach(() => {
    document.body.innerHTML = bodyMarkup;
    localStorage.clear();
    localStorage.setItem("kisavan_cta_variant", "A");
    history.replaceState({}, "", "/");
    vi.resetModules();

    global.fetch = vi.fn((url) => {
      if (String(url).startsWith("/api/quiz")) {
        return response({
          quiz: {
            id: "123e4567-e89b-12d3-a456-426614174000",
            slug: "francais-5e-diagnostic-v2",
            title: "Super Quiz",
            week_label: "Semaine 1"
          },
          questions: [{ id: "q1", prompt: "Quelle est 1+1 ?", choices: ["1", "2"] }]
        });
      }
      if (url === "/api/event") return response({ ok: true }, 201);
      throw new Error(`Unexpected fetch: ${url}`);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("imports app.js and initializes the complete entry point", async () => {
    await import("../app.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).toHaveBeenCalledWith(
      "/api/quiz?slug=francais-5e-diagnostic-v2",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } })
    );
    expect(typeof document.getElementById("start-btn").onclick).toBe("function");
    expect(document.getElementById("subtitle").textContent).toContain("Super Quiz");
  });
});
