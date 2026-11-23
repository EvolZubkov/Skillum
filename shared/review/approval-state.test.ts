/**
 * @module shared/review/approval-state.test
 * @description Правило бейджа «Согласовано» (PRD-52): один расчёт для клиента и тестов сервера.
 */
import { describe, it, expect } from "vitest";
import { anchorKeyOf } from "./anchor";
import { badgeForAuthor, badgeForReviewer, circleOf, type ApprovalRow } from "./approval-state";

const row = (reviewerId: string, stale = false): ApprovalRow => ({ reviewerId, stale });

describe("badgeForReviewer", () => {
  it("нет отметки - нет бейджа", () => {
    expect(badgeForReviewer(undefined)).toBeNull();
  });
  it("действующая отметка - сплошной бейдж", () => {
    expect(badgeForReviewer(row("r1"))).toBe("all");
  });
  it("отметка до правки - пунктирный бейдж", () => {
    expect(badgeForReviewer(row("r1", true))).toBe("stale");
  });
});

describe("circleOf", () => {
  it("круг - принявшие приглашение плюс все, кто поставил отметку", () => {
    expect(circleOf([row("r1")], ["r2", "r3"]).sort()).toEqual(["r1", "r2", "r3"]);
  });
  it("не дублирует рецензента, который и принял, и поставил отметку", () => {
    expect(circleOf([row("r1")], ["r1", "r2"]).sort()).toEqual(["r1", "r2"]);
  });
});

describe("badgeForAuthor", () => {
  const accepted = ["r1", "r2", "r3"];
  it("без отметок бейджа нет", () => {
    expect(badgeForAuthor([], accepted)).toBeNull();
  });
  it("согласовали все принявшие - сплошной", () => {
    expect(badgeForAuthor([row("r1"), row("r2"), row("r3")], accepted)).toBe("all");
  });
  it("согласовала часть - контурный", () => {
    expect(badgeForAuthor([row("r1")], accepted)).toBe("part");
  });
  it("все отметки до правки - пунктирный", () => {
    expect(badgeForAuthor([row("r1", true), row("r2", true)], accepted)).toBe("stale");
  });
  it("устаревшая отметка не засчитывается как согласование", () => {
    expect(badgeForAuthor([row("r1"), row("r2", true), row("r3")], accepted)).toBe("part");
  });
  it("рецензент вне списка принявших, но с отметкой, входит в круг", () => {
    expect(badgeForAuthor([row("r9"), row("r1")], ["r1"])).toBe("all");
  });
});

describe("anchorKeyOf", () => {
  it("берёт идентификатор объекта по виду якоря", () => {
    expect(anchorKeyOf({ kind: "question", questionId: "q1" })).toBe("q1");
    expect(anchorKeyOf({ kind: "topic", topicId: "t1" })).toBe("t1");
    expect(anchorKeyOf({ kind: "content-page", contentPageId: "p1" })).toBe("p1");
  });
  it("у экрана и теста целиком ключ пустой", () => {
    expect(anchorKeyOf({ kind: "test" })).toBe("");
    expect(anchorKeyOf({ kind: "start" })).toBe("");
    expect(anchorKeyOf({ kind: "results" })).toBe("");
  });
});
