/**
 * @module features/tests/review/use-approval-marks
 * @description PRD-52: хук окна рецензирования - держит бейджи согласования на карте вопросов в iframe пакета.
 * Пакет перестраивает экран на каждом вопросе, поэтому атрибуты ставятся заново: по снимку инспектора и по
 * изменениям DOM кадра (кадр откладывается, чтобы не молотить на каждый узел).
 *
 * Идентификаторы вопросов в порядке выдачи берутся из живого состояния пакета (`flatQuestions`) тем же
 * `TBInspector.readPkg`, которым пользуется инспектор: точка знает только индекс `goto:N`, а отметка хранится по
 * идентификатору вопроса.
 */
import { useCallback, useEffect, type RefObject } from "react";
import approvalCss from "./approval-marks.css?raw";
import { applyApprovalMarks, ensureApprovalLegend, ensureApprovalStyle, removeApprovalLegend } from "./approval-marks";
import type { ApprovalBadge } from "@shared/review/approval-state";
import { deliveredQuestionIds } from "./delivery-order";
import { badgeOfQuestion } from "./review-approval-model";
import { useReviewApprovals } from "./use-review-approvals";

export function useApprovalMarks(
  frameRef: RefObject<HTMLIFrameElement | null>,
  viewer: "reviewer" | "author" | null,
  badgeOf: (questionId: string) => ApprovalBadge | null,
  /** Меняется на каждый снимок инспектора: повод пересчитать. */
  tick: unknown,
  /** Есть ли рецензенты: без них легенда в панели «Все вопросы» не нужна. */
  showLegend = true,
): void {
  useEffect(() => {
    const frame = frameRef.current;
    const win = frame?.contentWindow as unknown as Window | undefined;
    const doc = frame?.contentDocument;
    if (!frame || !win || !doc || !viewer) return undefined;

    let timer = 0;
    const apply = () => {
      timer = 0;
      if (!doc.body) return;
      ensureApprovalStyle(doc, approvalCss);
      if (showLegend) ensureApprovalLegend(doc, viewer);
      else removeApprovalLegend(doc);
      applyApprovalMarks(doc, deliveredQuestionIds(win), badgeOf);
    };
    // Таймер хоста, а не кадра: у кадра в тестовой среде может не быть `requestAnimationFrame`, а пакет к моменту
    // срабатывания может уже сменить документ.
    const schedule = () => {
      if (!timer) timer = window.setTimeout(apply, 0);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    if (doc.body) observer.observe(doc.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [frameRef, viewer, badgeOf, tick, showLegend]);
}

/**
 * Хук окон рецензирования целиком: берёт отметки теста, строит правило бейджа по зрителю и держит бейджи на карте
 * вопросов. Одно место для двух окон (отладчик автора и окно рецензента): правило не должно расходиться.
 */
export function useReviewApprovalMarks(
  frameRef: RefObject<HTMLIFrameElement | null>,
  testId: string,
  tick: unknown,
): void {
  const { viewer, approvals, circle, hasReviewers } = useReviewApprovals(testId);
  const circleKey = circle.map((r) => r.userId).join(",");
  const badgeOf = useCallback(
    (questionId: string) =>
      viewer ? badgeOfQuestion(viewer, approvals, circleKey ? circleKey.split(",") : [], questionId) : null,
    [viewer, approvals, circleKey],
  );
  useApprovalMarks(frameRef, viewer, badgeOf, tick, hasReviewers);
}
