/**
 * @module server/services/__tests__/review-content-hash.test
 * @description The review content hash: one rule of «what is the content of a question», shared by the reader of
 * staleness and the writer of `questions.content_changed_at` (PRD-52, issue 61).
 */
import { describe, expect, it } from "vitest";
import { questionReviewHash, stable } from "../review-content-hash";

const base = { prompt: "Q?", dataJson: { options: ["a", "b"] }, correctJson: { correctIndex: 0 }, feedback: null };

describe("questionReviewHash", () => {
  it("moves with the prompt, the options, the key and the feedback", () => {
    const h = questionReviewHash(base);
    expect(questionReviewHash({ ...base, prompt: "Q2?" })).not.toBe(h);
    expect(questionReviewHash({ ...base, dataJson: { options: ["a", "c"] } })).not.toBe(h);
    expect(questionReviewHash({ ...base, correctJson: { correctIndex: 1 } })).not.toBe(h);
    expect(questionReviewHash({ ...base, feedback: "because" })).not.toBe(h);
  });

  it("does not move on key order, and treats a missing feedback as null", () => {
    expect(questionReviewHash({ ...base, dataJson: { b: 1, a: 2 } })).toBe(questionReviewHash({ ...base, dataJson: { a: 2, b: 1 } }));
    expect(questionReviewHash({ prompt: "Q?", dataJson: base.dataJson, correctJson: base.correctJson })).toBe(questionReviewHash(base));
  });
});

describe("stable", () => {
  it("sorts object keys at every depth", () => {
    expect(stable({ b: { y: 1, x: 2 }, a: [3] })).toBe('{"a":[3],"b":{"x":2,"y":1}}');
  });
});
