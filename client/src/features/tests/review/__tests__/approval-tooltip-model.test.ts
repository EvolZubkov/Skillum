/**
 * @module features/tests/review/__tests__/approval-tooltip-model.test
 * @description Content of the author's tooltip over a question dot (issue #62).
 */
import { describe, expect, it } from "vitest";
import { buildApprovalTooltip } from "../approval-tooltip-model";
import type { ReviewApproval, ReviewerEntry } from "../review-approval-api";

function mark(over: Partial<ReviewApproval>): ReviewApproval {
  return {
    id: "a", testId: "t", reviewerId: "r1", reviewerName: "Ирина Петрова", anchorKind: "question",
    anchorKey: "q4", questionId: "q4", topicId: null, contentPageId: null, contextLabel: null,
    pinnedContentHash: "h", approvedAt: "2026-11-21T18:40:00.000Z", stale: false, orphaned: false,
    ...over,
  };
}

const circle: ReviewerEntry[] = [
  { userId: "r1", name: "Ирина Петрова", accepted: true },
  { userId: "r2", name: "Сергей Ковалёв", accepted: true },
  { userId: "r3", name: "Анна Воробьёва", accepted: true },
];

describe("buildApprovalTooltip", () => {
  it("counts the circle and lists marked reviewers first, earliest first", () => {
    const tip = buildApprovalTooltip(4, "q4", [
      mark({ reviewerId: "r2", approvedAt: "2026-11-21T19:12:00.000Z" }),
      mark({ reviewerId: "r1" }),
    ], circle);
    expect(tip?.title).toBe("Вопрос 4");
    expect(tip?.subtitle).toBe("Согласовали 2 из 3");
    expect(tip?.rows.map((r) => [r.name, r.iso !== null])).toEqual([
      ["Ирина Петрова", true], ["Сергей Ковалёв", true], ["Анна Воробьёва", false],
    ]);
  });

  it("does not count a stale mark but still lists it", () => {
    const tip = buildApprovalTooltip(4, "q4", [mark({ stale: true })], circle);
    expect(tip?.subtitle).toBe("Согласовали 0 из 3");
    expect(tip?.rows[0]).toMatchObject({ name: "Ирина Петрова", stale: true });
  });

  it("shows zero marks against the whole circle", () => {
    expect(buildApprovalTooltip(1, "q1", [], circle)?.subtitle).toBe("Согласовали 0 из 3");
  });

  it("ignores marks on other questions, other anchors and removed objects", () => {
    const tip = buildApprovalTooltip(4, "q4", [
      mark({ questionId: "q9", anchorKey: "q9" }),
      mark({ anchorKind: "test", questionId: null, anchorKey: "" }),
      mark({ orphaned: true }),
    ], circle);
    expect(tip?.subtitle).toBe("Согласовали 0 из 3");
  });

  it("lists a marked reviewer missing from the circle", () => {
    const tip = buildApprovalTooltip(4, "q4", [mark({ reviewerId: "r9", reviewerName: "Новый" })], circle);
    expect(tip?.subtitle).toBe("Согласовали 1 из 4");
  });

  it("returns null for an empty circle", () => {
    expect(buildApprovalTooltip(4, "q4", [], [])).toBeNull();
  });
});
