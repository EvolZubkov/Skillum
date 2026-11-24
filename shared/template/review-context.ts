/**
 * @module shared/template/review-context
 *
 * PRD-19 Block D — builder for the review/finish (обзор) screen context
 * (section-finish / test-finish, FR-08). Returns the pills map (all issued, so
 * every in-scope question is a jump target) PLUS the explicit unanswered list and
 * the «Завершить …» action. BOTH hosts call it so the обзор renders identically
 * (parity, PRD-12). Pure — reuses {@link buildQuestionProgress} for the pills.
 *
 * PRD-73: also decides whether the «Завершить …» may be used ({@link CtxReview.finishBlocked},
 * the shared rule {@link isFinishBlocked}) and, while it may not, prints the reason
 * into the existing `review.hint`.
 */

import { buildQuestionProgress, type QuestionStatus, type QuestionProgressItem } from "./question-progress-context";
import { renderPlainText } from "../text/plain";
import type { AnswerCommitScope } from "../flow/answer-commit-scope";
import { isFinishBlocked } from "../flow/finish-gate";
import type { CtxReview, CtxQuestionsProgress, CtxReviewUnanswered } from "./context";

/** A question for the review screen (adds the prompt for the explicit list). */
export interface ReviewQuestionItem extends QuestionProgressItem {
  prompt: string;
  /** `false` = not yet delivered to the learner; omitted from the обзор entirely. */
  delivered?: boolean;
}

/** Inputs for {@link buildReviewContext}. */
export interface BuildReviewContextInput {
  /** Flat delivered question order. */
  questions: ReviewQuestionItem[];
  /** questionId -> status; missing = `unanswered`. */
  statuses: Record<string, QuestionStatus>;
  /** Answer-commit scope. */
  commitScope: AnswerCommitScope;
  /** Section topic id being reviewed (sectional); null/undefined = whole test. */
  scopeTopicId?: string | null;
  /** True for the test-finish обзор (whole test), false for a section обзор. */
  isTest: boolean;
  /** Heading, e.g. «Раздел «Сеть»» / «Обзор теста». */
  scopeLabel: string;
  /** Finish-button label, e.g. «Завершить раздел» / «Завершить тест». */
  finishLabel: string;
  /**
   * The current question index — highlighted as «текущий» in the map. Set when the
   * обзор was opened via «К обзору» mid-flow (so the learner sees where they left off);
   * -1 (the default) for the end-of-flow обзор, which has no «current».
   */
  currentIndex?: number;
  /**
   * True when the обзор was opened via «К обзору» mid-flow: the footer then offers an
   * accented «Назад» and demotes «Завершить …». Default false (end-of-flow обзор).
   */
  canReturn?: boolean;
  /** «Назад» button label; defaults to «Назад». */
  backLabel?: string;
  /**
   * PRD-73 FR-01: the author requires an answer to every question before the finish.
   * Absent = the setting is off (a caller or a package from before PRD-73).
   */
  requireAllAnsweredToFinish?: boolean;
  /** PRD-19 FR-01: returning to skipped questions is allowed; absent = on (PRD-19 default). */
  allowReturnToUnanswered?: boolean;
}

/**
 * Build the обзор context: `{ questionsProgress, review }`. The host spreads
 * `questionsProgress` into `state` and `review` into the top-level context. Pills
 * are built with `allIssued` (every in-scope question reachable) and no «current»
 * (currentIndex -1), scoped by `scopeTopicId`.
 */
export function buildReviewContext(input: BuildReviewContextInput): {
  questionsProgress: CtxQuestionsProgress | null;
  review: CtxReview;
} {
  const sectionScope = input.commitScope === "section";
  const scopeTopicId = sectionScope ? (input.scopeTopicId ?? null) : null;

  const currentIndex = typeof input.currentIndex === "number" ? input.currentIndex : -1;

  const questionsProgress = buildQuestionProgress({
    questions: input.questions,
    statuses: input.statuses,
    // «К обзору» mid-flow highlights the origin question; end-of-flow has no current.
    currentIndex,
    commitScope: input.commitScope,
    scopeTopicId: sectionScope ? scopeTopicId : undefined,
    allIssued: true,
    allowReturn: true,
    scopeLabel: input.scopeLabel,
  });

  let answeredCount = 0;
  const unanswered: CtxReviewUnanswered[] = [];
  let pos = 0;
  input.questions.forEach((q, index) => {
    if (q.delivered === false) return; // not yet delivered — never listed
    if (sectionScope && (q.topicId ?? null) !== scopeTopicId) return;
    pos += 1;
    const status = input.statuses[q.id] ?? "unanswered";
    if (status === "answered") answeredCount++;
    // The review list is TEXT: the layout binds `{{prompt}}`, which the DSL escapes,
    // so markdown markers would show as characters. Strip them and keep the
    // typography, so the line reads like every other learner screen.
    else unanswered.push({ index, number: pos, prompt: renderPlainText(q.prompt) });
  });

  // PRD-73 FR-03: the finish is gated by EVERY question of the scope, delivered or not —
  // otherwise a mid-flow обзор would let the learner close the section before reaching
  // its end. The explicit list above still names only delivered questions: the learner
  // has not seen the prompts of the others yet.
  let unansweredInScope = 0;
  input.questions.forEach((q) => {
    if (sectionScope && (q.topicId ?? null) !== scopeTopicId) return;
    if ((input.statuses[q.id] ?? "unanswered") !== "answered") unansweredInScope += 1;
  });
  const finishBlocked = isFinishBlocked({
    requireAllAnsweredToFinish: input.requireAllAnsweredToFinish,
    allowReturnToUnanswered: input.allowReturnToUnanswered,
    hasUnanswered: unansweredInScope > 0,
  });

  const review: CtxReview = {
    scopeLabel: input.scopeLabel,
    isTest: input.isTest,
    finishLabel: input.finishLabel,
    unanswered,
    unansweredCount: unanswered.length,
    answeredCount,
    total: pos,
    hint: finishBlocked
      ? blockedHint(input.finishLabel, unansweredInScope)
      : unanswered.length > 0
        ? "Проверьте перед завершением. Неотвеченные засчитываются как неверные."
        : "Все вопросы отвечены.",
    canReturn: !!input.canReturn,
    backLabel: input.backLabel ?? "Назад",
    finishBlocked,
  };

  return { questionsProgress, review };
}

/**
 * PRD-73 FR-05: the reason the finish button is disabled. The verb follows the button's
 * own label, so «Завершить тест» yields «Чтобы завершить тест, …» without a second
 * source of truth for which finish this is.
 *
 * @param finishLabel The «Завершить …» label shown on the button.
 * @param remaining Questions of the scope still without an answer, undelivered included.
 * @returns The hint text, e.g. «Чтобы завершить раздел, ответьте на все вопросы. Осталось без ответа: 2.».
 */
function blockedHint(finishLabel: string, remaining: number): string {
  const action = finishLabel.charAt(0).toLowerCase() + finishLabel.slice(1);
  return `Чтобы ${action}, ответьте на все вопросы. Осталось без ответа: ${remaining}.`;
}
