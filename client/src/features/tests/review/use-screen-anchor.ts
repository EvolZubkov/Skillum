/**
 * @module features/tests/review/use-screen-anchor
 * @description PRD-52 FR-18: место комментария, снятое с ТЕКУЩЕГО экрана прогона.
 *
 * Резолвер берётся из инспектора пакета (`window.TBInspector.currentScreenQuestion`)
 * — тот же, что рисует эталон. Это важно: если бы «место» считалось отдельной
 * логикой, комментарий однажды указал бы не на тот вопрос, который человек видит,
 * а спорить с таким комментарием невозможно.
 *
 * В адаптивном тесте экран ведёт `adaptiveState.currentQuestionId`, а не плоский
 * список — резолвер это уже учитывает, поэтому дублировать разбор здесь нельзя.
 *
 * Резолвер отдаёт вопрос по индексу и на экранах без вопроса (старт, экран раздела, обзор, итоги), поэтому
 * вопросом место считается только в фазах `question` и `adaptive-session` пакета; иначе - тест целиком.
 */
import { useMemo, type RefObject } from "react";
import type { ReviewAnchor } from "@shared/review/anchor";
import type { InspectorSnapshot } from "@/features/tests/debug-player/inspector-snapshot";
import { screenShowsQuestion } from "./delivery-order";

export function useScreenAnchor(
  frameRef: RefObject<HTMLIFrameElement | null>,
  snap: InspectorSnapshot | null,
): ReviewAnchor {
  // Пересчитывается на каждый снимок: прогон идёт, экран меняется.
  return useMemo(() => {
    const win = frameRef.current?.contentWindow as unknown as Window | undefined;
    const inspector = window.TBInspector;
    if (!win || !inspector?.currentScreenQuestion || !screenShowsQuestion(win)) return { kind: "test" };
    try {
      const q = inspector.currentScreenQuestion(win) as
        | { id?: string; topicId?: string }
        | null;
      if (q?.id) return { kind: "question", questionId: q.id, topicId: q.topicId ?? null };
    } catch {
      // Экран ещё не построен — комментарий уйдёт к тесту целиком, а не к «какому-то»
      // вопросу: лучше общее место, чем ложное.
    }
    return { kind: "test" };
  }, [frameRef, snap]);
}
