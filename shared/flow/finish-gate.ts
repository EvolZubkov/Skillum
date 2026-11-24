/**
 * @module shared/flow/finish-gate
 *
 * PRD-73 — the single rule deciding whether the learner may finish a section
 * (sectional flows) or the whole test (flat flow) from the обзор screen, and
 * whether the author's «hide the review screen» applies right now.
 *
 * It lives next to {@link module:shared/flow/review-gate} because both answer the
 * same question from two sides: `review-gate` decides whether the обзор is worth
 * showing, this module decides whether its «Завершить …» may be used. Both runtime
 * hosts read it, so the two can never drift apart (PRD-12 parity): the web host
 * imports it directly, the SCORM package gets it through the `TBTemplate` bundle.
 *
 * Only a finish the learner CHOOSES is gated. Forced finishes — the test or section
 * time running out, PRD-67 closing a section on leave, the runtime's fallback when a
 * template ships no `review` layout — never consult this module (PRD-73 §3.4).
 */

/** Inputs of {@link isFinishBlocked} and {@link reviewHiddenByAuthor}. */
export interface FinishGateInput {
  /** PRD-73 FR-01: the author requires an answer to every question before the finish. */
  requireAllAnsweredToFinish?: boolean;
  /**
   * PRD-19 FR-01: the learner may skip a question and come back to it. Without it the
   * run is strictly linear, nothing can be left unanswered, and the setting has nothing
   * to forbid. Absent reads as «on», the PRD-19 default.
   */
  allowReturnToUnanswered?: boolean;
  /**
   * Whether the scope (current section, or the whole flat test) still holds a question
   * without a SUBMITTED answer. Not-yet-delivered questions of the scope count too:
   * otherwise a mid-flow обзор would let the learner close the section early.
   */
  hasUnanswered: boolean;
}

/**
 * Whether the learner may NOT finish the scope from the обзор screen.
 *
 * @param input Settings of the test plus whether the scope still has an unanswered question.
 * @returns `true` while the author requires every answer, returning is allowed and
 *   something in the scope is still unanswered.
 */
export function isFinishBlocked(input: FinishGateInput): boolean {
  const requireAll = input.requireAllAnsweredToFinish === true;
  const canReturn = input.allowReturnToUnanswered ?? true;
  return requireAll && canReturn && input.hasUnanswered;
}

/**
 * Whether the author's «hide the review screen» applies right now (PRD-73 §3.5).
 *
 * While the finish is blocked the обзор is the only way back to the skipped questions,
 * so hiding it would end the section with them unanswered — exactly what the author
 * forbade. The hiding therefore yields until the scope is fully answered.
 *
 * @param hidden The author hid the `review` system screen (`isSystemScreenHidden`).
 * @param input Same input as {@link isFinishBlocked}.
 * @returns `true` when the screen is hidden and the finish is not blocked.
 */
export function reviewHiddenByAuthor(hidden: boolean, input: FinishGateInput): boolean {
  return hidden && !isFinishBlocked(input);
}
