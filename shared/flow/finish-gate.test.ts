/**
 * @module shared/flow/finish-gate.test
 * @description PRD-73 truth tables both hosts must obey: when the learner may not
 * finish a section (or a flat test) from the review screen, and when the author's
 * «hide the review screen» still applies.
 */
import { describe, it, expect } from "vitest";
import { isFinishBlocked, reviewHiddenByAuthor } from "./finish-gate";

describe("isFinishBlocked", () => {
  it("запрещает завершение, пока в охвате есть вопрос без ответа", () => {
    expect(
      isFinishBlocked({ requireAllAnsweredToFinish: true, allowReturnToUnanswered: true, hasUnanswered: true }),
    ).toBe(true);
  });

  it("разрешает, когда отвечено всё", () => {
    expect(
      isFinishBlocked({ requireAllAnsweredToFinish: true, allowReturnToUnanswered: true, hasUnanswered: false }),
    ).toBe(false);
  });

  it("не действует при выключенной настройке", () => {
    expect(
      isFinishBlocked({ requireAllAnsweredToFinish: false, allowReturnToUnanswered: true, hasUnanswered: true }),
    ).toBe(false);
  });

  it("не действует, когда настройки нет в данных (пакет до PRD-73)", () => {
    expect(isFinishBlocked({ allowReturnToUnanswered: true, hasUnanswered: true })).toBe(false);
  });

  it("не действует без возврата к неотвеченным, даже если книга принесла противоречие", () => {
    expect(
      isFinishBlocked({ requireAllAnsweredToFinish: true, allowReturnToUnanswered: false, hasUnanswered: true }),
    ).toBe(false);
  });

  it("читает отсутствующий возврат как включённый — умолчание PRD-19", () => {
    expect(isFinishBlocked({ requireAllAnsweredToFinish: true, hasUnanswered: true })).toBe(true);
  });
});

describe("reviewHiddenByAuthor", () => {
  const blocked = { requireAllAnsweredToFinish: true, allowReturnToUnanswered: true, hasUnanswered: true };

  it("не скрывает экран, который автор не скрывал", () => {
    expect(reviewHiddenByAuthor(false, blocked)).toBe(false);
  });

  it("скрывает, когда запрета нет: отвечено всё", () => {
    expect(reviewHiddenByAuthor(true, { ...blocked, hasUnanswered: false })).toBe(true);
  });

  it("снимает скрытие, пока запрет действует: обзор — единственный путь к пропущенным", () => {
    expect(reviewHiddenByAuthor(true, blocked)).toBe(false);
  });

  it("скрывает по-прежнему, когда настройка выключена", () => {
    expect(reviewHiddenByAuthor(true, { ...blocked, requireAllAnsweredToFinish: false })).toBe(true);
  });
});
