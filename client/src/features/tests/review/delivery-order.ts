/**
 * @module features/tests/review/delivery-order
 * @description PRD-52: read-side helpers over the live state of the package running in the review/debug iframe.
 * One place for the delivery order of questions, so approval badges on the question map and the «Вопрос N»
 * title of the current-question approval card follow the SAME rule.
 */

/** Loose shape of the live package state, as returned by `TBInspector.readPkg`. */
interface LivePkgState {
  flatQuestions?: { question?: { id?: string }; id?: string }[];
  adaptiveState?: { isFinished?: boolean } | null;
}

/** Reads the live package state of the frame; `null` while the package has not built it yet. */
function readState(win: Window): LivePkgState | null {
  try {
    const pkg = window.TBInspector?.readPkg?.(win) as { state?: LivePkgState | null } | null | undefined;
    return pkg?.state ?? null;
  } catch {
    // The package has not built its state yet - callers retry on the next snapshot.
    return null;
  }
}

/**
 * Question ids in the delivery order of the run; empty until the package has started.
 * The list item is `{ question: { id, ... } }` (verified on a live run); top-level `id` is a fallback layout.
 */
export function deliveredQuestionIds(win: Window): string[] {
  return (readState(win)?.flatQuestions ?? []).map((q) => q.question?.id ?? q.id ?? "");
}

/**
 * Pure rule of the on-screen question number.
 * Standard test: 1-based position of the question in the delivery order. Adaptive run: the flat list does not
 * drive the screen, so the number is «answered + 1», the same counter as the status-bar progress.
 * Returns `null` when the screen has no resolvable question (start, results, unknown id).
 */
export function questionNumber(
  questionId: string,
  order: readonly string[],
  adaptive: boolean,
  answered: number,
): number | null {
  if (adaptive) return answered + 1;
  const index = order.indexOf(questionId);
  return index >= 0 ? index + 1 : null;
}

/** Number of the question currently on screen in the frame, or `null` (see {@link questionNumber}). */
export function screenQuestionNumber(win: Window | null | undefined, questionId: string, answered: number): number | null {
  if (!win) return null;
  const state = readState(win);
  if (!state) return null;
  const adaptive = Boolean(state.adaptiveState && !state.adaptiveState.isFinished);
  const order = (state.flatQuestions ?? []).map((q) => q.question?.id ?? q.id ?? "");
  return questionNumber(questionId, order, adaptive, answered);
}
