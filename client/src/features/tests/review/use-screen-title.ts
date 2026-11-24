/**
 * @module features/tests/review/use-screen-title
 * @description PRD-52: title of the current-question approval card, «Вопрос N» (wireframe
 * `prd52-review-approval.html`). The screen anchor carries only the question id, so the number is resolved
 * from the live package state on every inspector snapshot.
 */
import { useMemo, type RefObject } from "react";
import type { ReviewAnchor } from "@shared/review/anchor";
import type { InspectorSnapshot } from "@/features/tests/debug-player/inspector-snapshot";
import { screenQuestionNumber } from "./delivery-order";

/** Returns «Вопрос N», or `undefined` when the number is unknown (the card then keeps its default title). */
export function useScreenTitle(
  frameRef: RefObject<HTMLIFrameElement | null>,
  snap: InspectorSnapshot | null,
  anchor: ReviewAnchor,
): string | undefined {
  return useMemo(() => {
    if (anchor.kind !== "question" || !anchor.questionId) return undefined;
    const win = frameRef.current?.contentWindow as unknown as Window | undefined;
    const n = screenQuestionNumber(win, anchor.questionId, snap?.status.answered ?? 0);
    return n ? `Вопрос ${n}` : undefined;
    // `snap` is the recompute trigger: the run moves, the screen changes.
  }, [frameRef, snap, anchor]);
}
