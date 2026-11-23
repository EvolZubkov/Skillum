/**
 * @module features/tests/review/__tests__/review-approval-model.test
 * @description PRD-52: подготовка данных согласования - поиск своей отметки по якорю, сводка по разделам, матрица,
 * фильтр. Чистые функции: вся логика экрана здесь, разметка её не повторяет.
 */
import { describe, it, expect } from "vitest";
import {
  findApproval, buildApprovalSections, filterSections, type SectionInput,
} from "../review-approval-model";
import type { ReviewApproval } from "../review-approval-api";

const ap = (over: Partial<ReviewApproval> = {}): ReviewApproval => ({
  id: "a", testId: "t", reviewerId: "r1", reviewerName: "Ирина Петрова", anchorKind: "question", anchorKey: "q1",
  questionId: "q1", topicId: "tp1", contentPageId: null, contextLabel: null, pinnedContentHash: "h",
  approvedAt: "2026-11-21T18:40:00Z", stale: false, orphaned: false, ...over,
});

const sections: SectionInput[] = [
  { topicId: "tp1", title: "Раздел «О компании»", questions: [
    { id: "q1", label: "Вопрос 1" }, { id: "q2", label: "Вопрос 2" }, { id: "q3", label: "Вопрос 3" },
  ] },
  { topicId: "tp2", title: "Раздел «Финансы»", questions: [{ id: "q4", label: "Вопрос 1" }] },
];

describe("findApproval", () => {
  it("находит отметку по якорю", () => {
    expect(findApproval([ap()], { kind: "question", questionId: "q1" })?.id).toBe("a");
  });
  it("тест целиком ищется по пустому ключу", () => {
    const test = ap({ id: "t", anchorKind: "test", anchorKey: "", questionId: null });
    expect(findApproval([ap(), test], { kind: "test" })?.id).toBe("t");
  });
  it("нет отметки - undefined", () => {
    expect(findApproval([ap()], { kind: "question", questionId: "q9" })).toBeUndefined();
  });
  it("вид якоря учитывается: отметка на вопрос не находится как отметка на тест", () => {
    expect(findApproval([ap()], { kind: "test" })).toBeUndefined();
  });
});

describe("buildApprovalSections", () => {
  const reviewers = ["r1", "r2"];
  const rows = [
    ap({ reviewerId: "r1", anchorKey: "q1", questionId: "q1" }),
    ap({ id: "b", reviewerId: "r2", anchorKey: "q1", questionId: "q1" }),
    ap({ id: "c", reviewerId: "r1", anchorKey: "q2", questionId: "q2", stale: true }),
    ap({ id: "d", reviewerId: "r1", anchorKey: "q4", questionId: "q4" }),
    ap({ id: "e", reviewerId: "r2", anchorKey: "q4", questionId: "q4" }),
  ];
  const built = buildApprovalSections(sections, rows, reviewers);

  it("считает вопросы по состоянию круга", () => {
    expect(built[0]).toMatchObject({ total: 3, all: 1, stale: 1, none: 1, part: 0 });
    expect(built[1]).toMatchObject({ total: 1, all: 1, stale: 0, none: 0 });
  });
  it("в строке матрицы ячейка пуста там, где рецензент не согласовал", () => {
    const row = built[0].rows.find((r) => r.questionId === "q2")!;
    expect(row.cells.r1?.stale).toBe(true);
    expect(row.cells.r2).toBeNull();
  });
  it("состояние строки совпадает с правилом бейджа автора", () => {
    expect(built[0].rows.map((r) => r.state)).toEqual(["all", "stale", null]);
  });
  it("отметка рецензента вне переданного круга не ломает строку", () => {
    const withOutsider = buildApprovalSections(sections, [ap({ reviewerId: "r9" })], ["r1"]);
    expect(withOutsider[0].rows[0].state).toBe("part");
  });
});

describe("filterSections", () => {
  const built = buildApprovalSections(sections, [
    ap({ reviewerId: "r1", anchorKey: "q4", questionId: "q4" }),
  ], ["r1"]);

  it("«требуют внимания» скрывает раздел, где всё согласовано, и считает скрытые", () => {
    const res = filterSections(built, { mode: "attn", query: "", reviewerId: null });
    expect(res.sections.map((s) => s.topicId)).toEqual(["tp1"]);
    expect(res.hidden).toBe(1);
  });
  it("«все» показывает все разделы", () => {
    const res = filterSections(built, { mode: "all", query: "", reviewerId: null });
    expect(res.sections.map((s) => s.topicId)).toEqual(["tp1", "tp2"]);
    expect(res.hidden).toBe(0);
  });
  it("«не согласованы» оставляет вопросы без единой отметки", () => {
    const res = filterSections(built, { mode: "none", query: "", reviewerId: null });
    expect(res.sections[0].rows.map((r) => r.questionId)).toEqual(["q1", "q2", "q3"]);
  });
  it("поиск оставляет строки с найденным текстом", () => {
    const res = filterSections(built, { mode: "all", query: "вопрос 2", reviewerId: null });
    expect(res.sections[0].rows.map((r) => r.questionId)).toEqual(["q2"]);
  });
  it("пустой результат поиска - нет разделов", () => {
    expect(filterSections(built, { mode: "all", query: "бюджет", reviewerId: null }).sections).toEqual([]);
  });
  it("фильтр по рецензенту оставляет вопросы, где он ещё не согласовал", () => {
    const rows = buildApprovalSections(sections, [
      ap({ reviewerId: "r1", anchorKey: "q1", questionId: "q1" }),
    ], ["r1"]);
    const res = filterSections(rows, { mode: "all", query: "", reviewerId: "r1" });
    expect(res.sections[0].rows.map((r) => r.questionId)).toEqual(["q2", "q3"]);
  });
});
