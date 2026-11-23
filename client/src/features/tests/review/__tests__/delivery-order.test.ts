/**
 * @module features/tests/review/__tests__/delivery-order.test
 * @description Tests of the on-screen question number rule behind the «Вопрос N» approval card title.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { questionNumber, screenQuestionNumber } from "../delivery-order";

describe("questionNumber", () => {
  it("returns the 1-based position in the delivery order", () => {
    expect(questionNumber("q4", ["q1", "q2", "q3", "q4"], false, 0)).toBe(4);
  });
  it("returns null for a question outside the order", () => {
    expect(questionNumber("zz", ["q1"], false, 0)).toBeNull();
    expect(questionNumber("q1", [], false, 0)).toBeNull();
  });
  it("counts answered + 1 in an adaptive run", () => {
    expect(questionNumber("any", [], true, 3)).toBe(4);
  });
});

describe("screenQuestionNumber", () => {
  afterEach(() => {
    delete (window as unknown as { TBInspector?: unknown }).TBInspector;
  });
  const win = {} as Window;
  function mockState(state: unknown) {
    (window as unknown as { TBInspector: unknown }).TBInspector = { readPkg: vi.fn(() => ({ state })) };
  }

  it("reads flatQuestions of the live state", () => {
    mockState({ flatQuestions: [{ question: { id: "a" } }, { question: { id: "b" } }] });
    expect(screenQuestionNumber(win, "b", 0)).toBe(2);
  });
  it("uses answered + 1 while the adaptive run is going", () => {
    mockState({ flatQuestions: [], adaptiveState: { isFinished: false } });
    expect(screenQuestionNumber(win, "x", 2)).toBe(3);
  });
  it("returns null without a package state or a frame", () => {
    mockState(null);
    expect(screenQuestionNumber(win, "a", 0)).toBeNull();
    expect(screenQuestionNumber(null, "a", 0)).toBeNull();
  });
});
