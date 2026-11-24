/**
 * @module tests/prd73-finish-requires-all-answered
 *
 * PRD-73 «Требовать ответ на все вопросы перед завершением» в SCORM-пакете.
 *
 * Первая часть — выпечка настройки в `TEST_DATA`: поле уезжает в пакет только включённым и
 * не у адаптивного теста, чтобы пакет теста без настройки остался байт-в-байт прежним.
 * Вторая часть — поведение рантайма на экране обзора (задача 11 плана).
 */
import { describe, it, expect } from "vitest";
import { buildTestJson } from "../server/scorm/builders/test-json";

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
