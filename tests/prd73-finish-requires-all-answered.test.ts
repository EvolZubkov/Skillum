/**
 * @module tests/prd73-finish-requires-all-answered
 *
 * PRD-73 «Требовать ответ на все вопросы перед завершением» в SCORM-пакете.
 *
 * Первая часть — выпечка настройки в `TEST_DATA`: поле уезжает в пакет только включённым и
 * не у адаптивного теста, чтобы пакет теста без настройки остался байт-в-байт прежним.
 * Вторая часть — поведение рантайма на экране обзора: функции рантайма извлекаются из
 * исходника (тем же приёмом, что в `scorm-review-finish.test.ts`) и исполняются над
 * заглушками его глобалов, а общее ядро `TBTemplate` — НАСТОЯЩЕЕ, из `shared/`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { buildTestJson } from "../server/scorm/builders/test-json";
import { renderScreenInto } from "../shared/template/render-screen";
import { buildReviewContext } from "../shared/template/review-context";
import { disableActions } from "../shared/template/action-disable";
import { isFinishBlocked, reviewHiddenByAuthor } from "../shared/flow/finish-gate";
import { shouldShowReview } from "../shared/flow/review-gate";

const baseTest = {
  id: "t1",
  title: "Тест",
  description: null,
  mode: "standard",
  overallPassRuleJson: { type: "percent", value: 70 },
  webhookUrl: null,
  feedback: null,
  feedbackJson: null,
  timeLimitMinutes: null,
  maxAttempts: 3,
  showCorrectAnswers: false,
  startPageContent: null,
  showDifficultyLevel: true,
  allowReturnToUnanswered: true,
};

function fixture(overrides: Record<string, unknown>) {
  return {
    test: { ...baseTest, ...overrides },
    sections: [
      {
        id: "sec-1", topicId: "t1", drawCount: 1, required: true, feedbackJson: null,
        topic: { id: "t1", name: "Тема", feedback: null, feedbackJson: null },
        questions: [
          {
            id: "q1", type: "single", prompt: "?", dataJson: {}, correctJson: { correctIndex: 0 },
            points: 1, difficulty: 50, tags: [],
          },
        ],
        courses: [], events: [],
      },
    ],
  } as never;
}

const bake = (data: unknown): Record<string, unknown> => JSON.parse(buildTestJson(data as never));

describe("PRD-73: выпечка запрета завершения в пакет", () => {
  it("включённая настройка уезжает в TEST_DATA", () => {
    expect(bake(fixture({ requireAllAnsweredToFinish: true })).requireAllAnsweredToFinish).toBe(true);
  });

  it("выключенная и отсутствующая в пакет не попадают — пакет прежний", () => {
    expect("requireAllAnsweredToFinish" in bake(fixture({ requireAllAnsweredToFinish: false }))).toBe(false);
    expect("requireAllAnsweredToFinish" in bake(fixture({}))).toBe(false);
  });

  it("адаптивный тест её не получает (FR-09)", () => {
    const baked = bake(fixture({ mode: "adaptive", requireAllAnsweredToFinish: true }));
    expect("requireAllAnsweredToFinish" in baked).toBe(false);
  });
});

// ─── Вторая часть: рантайм пакета на экране обзора ─────────────────────────────

const mainRenderSrc = readFileSync(
  resolve(process.cwd(), "server/scorm/template/app/render/mainRender.js"),
  "utf8",
);
const reviewLayout = readFileSync(
  resolve(process.cwd(), "server/scorm/templates/default/layouts/review.html"),
  "utf8",
);

/** A top-level `function name(...) { ... }` — declared and closed at column 0. */
function extractTopLevel(src: string, name: string): string {
  const m = src.match(new RegExp(String.raw`^function ${name}\([^)]*\)\s*\{[\s\S]*?\n\}`, "m"));
  if (!m) throw new Error(`${name} не найдена среди функций верхнего уровня`);
  return m[0];
}

const TB = {
  renderScreenInto,
  buildReviewContext,
  disableActions,
  isFinishBlocked,
  reviewHiddenByAuthor,
  shouldShowReview,
};

/** Two questions of one section; `q2Status` decides whether the section is complete. */
function runtimeState(q2Status: "answered" | "skipped") {
  return {
    currentIndex: 1,
    reviewOrigin: null as number | null,
    fromReview: false,
    phase: "review",
    flatQuestions: [
      { topicId: "t1", topicName: "Тема", question: { id: "q1", prompt: "Вопрос один" } },
      { topicId: "t1", topicName: "Тема", question: { id: "q2", prompt: "Вопрос два" } },
    ],
    questionStatuses: { q1: "answered", q2: q2Status } as Record<string, string>,
  };
}

/** Run `renderReviewScreen` over stubbed runtime globals and the REAL shared core. */
function renderReview(testData: Record<string, unknown>, q2Status: "answered" | "skipped") {
  document.body.innerHTML = '<div id="app"></div>';
  (window as unknown as { TBTemplate: unknown }).TBTemplate = TB;
  const spies = {
    finishSection: vi.fn(),
    submit: vi.fn(),
    showFinishConfirm: vi.fn(),
    goToQuestionIndex: vi.fn(),
  };
  const state = runtimeState(q2Status);
  const run = new Function(
    "TEST_DATA", "state", "spies", "layout",
    `
    var RouterFlow = { isRouterMode: function () { return false; }, returnFromTopic: function () {} };
    function systemLayout() { return layout; }
    function applySystemScreenStyles() {}
    function scormDesignContext() { return {}; }
    function buildScormProtection() { return undefined; }
    function revealSceneTimers() {}
    var finishSection = spies.finishSection;
    var submit = spies.submit;
    var showFinishConfirm = spies.showFinishConfirm;
    var goToQuestionIndex = spies.goToQuestionIndex;
    ${extractTopLevel(mainRenderSrc, "isLastSectionTopic")}
    ${extractTopLevel(mainRenderSrc, "renderReviewScreen")}
    renderReviewScreen();`,
  );
  run({ answerCommitScope: "section", allowReturnToUnanswered: true, showSectionResults: true, ...testData }, state, spies, reviewLayout);
  const finish = document.querySelector('#app [data-action="finish-review"]') as HTMLButtonElement;
  return { spies, finish, text: document.getElementById("app")!.textContent ?? "" };
}

/** Run `reviewIsWorthShowing` with the author's hiding of the обзор switched on. */
function worthShowing(testData: Record<string, unknown>, q2Status: "answered" | "skipped"): boolean {
  const run = new Function(
    "TEST_DATA", "state", "TBTemplate",
    `
    function screenHidden(kind) { return kind === 'review'; }
    ${extractTopLevel(mainRenderSrc, "hasUnansweredInScope")}
    ${extractTopLevel(mainRenderSrc, "reviewIsWorthShowing")}
    return reviewIsWorthShowing('t1');`,
  );
  return run({ allowReturnToUnanswered: true, ...testData }, runtimeState(q2Status), TB) as boolean;
}

describe("PRD-73: обзор в рантайме пакета", () => {
  it("с пропуском кнопка завершения неактивна, подсказка называет число", () => {
    const { finish, text } = renderReview({ requireAllAnsweredToFinish: true }, "skipped");
    expect(finish.disabled).toBe(true);
    expect(text).toContain("Осталось без ответа: 1");
  });

  it("клик по кнопке с запретом ничего не делает, даже если disabled снят", () => {
    const { finish, spies } = renderReview({ requireAllAnsweredToFinish: true }, "skipped");
    finish.disabled = false;
    finish.click();
    expect(spies.finishSection).not.toHaveBeenCalled();
    expect(spies.showFinishConfirm).not.toHaveBeenCalled();
  });

  it("когда отвечено всё, кнопка активна и завершает раздел", () => {
    const { finish, spies } = renderReview({ requireAllAnsweredToFinish: true }, "answered");
    expect(finish.disabled).toBe(false);
    finish.click();
    expect(spies.finishSection).toHaveBeenCalledTimes(1);
  });

  it("без настройки пропуск завершается как прежде — через подтверждение внутри finishSection", () => {
    const { finish, spies } = renderReview({}, "skipped");
    expect(finish.disabled).toBe(false);
    finish.click();
    expect(spies.finishSection).toHaveBeenCalledWith("t1", true, 1, false);
  });
});

describe("PRD-73: скрытый автором обзор в рантайме пакета (§3.5)", () => {
  it("показывается, пока есть пропуски", () => {
    expect(worthShowing({ requireAllAnsweredToFinish: true }, "skipped")).toBe(true);
  });

  it("скрыт, когда отвечено всё", () => {
    expect(worthShowing({ requireAllAnsweredToFinish: true, allowAnswerChange: true }, "answered")).toBe(false);
  });

  it("без настройки скрыт, как прежде", () => {
    expect(worthShowing({}, "skipped")).toBe(false);
  });
});
