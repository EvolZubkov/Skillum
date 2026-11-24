/**
 * @module features/tests/editor/questions/__tests__/test-context-questions.test
 * @description Merging the bank with the questions read in the context of a test, the cache
 * key that the bank invalidation reaches, and the choice between the question editor and the
 * learner-eye preview (role-model.md 6.5.1).
 */
import { describe, it, expect } from "vitest";
import {
  mergeQuestionRows,
  questionOpenTarget,
  testContextQuestionsKey,
} from "../test-context-questions";

describe("mergeQuestionRows", () => {
  it("keeps the bank as is when the test adds nothing", () => {
    const bank = [{ id: "a" }, { id: "b" }];
    expect(mergeQuestionRows(bank, undefined)).toEqual(bank);
    expect(mergeQuestionRows(bank, [])).toEqual(bank);
  });

  it("appends only the questions the bank does not carry, bank first", () => {
    const bank = [{ id: "a", topicId: "t1" }];
    const context = [{ id: "a", topicId: "t1" }, { id: "x", topicId: "t2" }];
    expect(mergeQuestionRows(bank, context)).toEqual([
      { id: "a", topicId: "t1" },
      { id: "x", topicId: "t2" },
    ]);
  });

  it("works before the bank has loaded", () => {
    expect(mergeQuestionRows(undefined, [{ id: "x" }])).toEqual([{ id: "x" }]);
    expect(mergeQuestionRows(undefined, undefined)).toEqual([]);
  });
});

describe("testContextQuestionsKey", () => {
  it("starts with the bank key, so invalidating the bank refreshes it", () => {
    expect(testContextQuestionsKey("test-1")).toEqual(["/api/questions", "test-context", "test-1"]);
  });
});

describe("questionOpenTarget", () => {
  const readOnly = new Set(["t-law"]);

  it("opens nothing while the question is unknown", () => {
    expect(questionOpenTarget(null, readOnly)).toBeNull();
  });

  it("opens the preview for a question of a read-only topic", () => {
    expect(questionOpenTarget({ topicId: "t-law" }, readOnly)).toBe("preview");
  });

  it("opens the editor otherwise", () => {
    expect(questionOpenTarget({ topicId: "t-own" }, readOnly)).toBe("editor");
    expect(questionOpenTarget({ topicId: null }, readOnly)).toBe("editor");
  });
});
