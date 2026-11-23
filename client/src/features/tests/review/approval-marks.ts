/**
 * @module features/tests/review/approval-marks
 * @description PRD-52: бейджи согласования на точках карты вопросов внутри iframe пакета.
 *
 * Хост ставит на точку атрибут `data-review-approved` (all | part | stale), а рисует бейдж CSS: узлов в DOM экрана
 * нет, поэтому перерисовка экрана, которую пакет делает на каждом вопросе, бейдж не стирает - хосту достаточно
 * повторить атрибуты. Один селектор красит точки в строке карты и в панели «Все вопросы». Шаблон и контракт не
 * меняются, в боевом пакете бейджа нет.
 */
import type { ApprovalBadge } from "@shared/review/approval-state";

/** Точка карты: и в строке, и в панели у неё один и тот же `goto:N`. */
const DOT = '.ou-quiz__dot[data-action^="goto:"]';

/** Расставляет бейджи: индекс точки (`goto:N`) переводится в вопрос по порядку выдачи прогона. */
export function applyApprovalMarks(
  doc: Document,
  questionIds: readonly string[],
  badgeOf: (questionId: string) => ApprovalBadge | null,
): void {
  for (const dot of doc.querySelectorAll<HTMLElement>(DOT)) {
    const index = Number.parseInt((dot.getAttribute("data-action") ?? "").slice("goto:".length), 10);
    const id = Number.isFinite(index) ? questionIds[index] : undefined;
    const badge = id ? badgeOf(id) : null;
    if (badge) dot.setAttribute("data-review-approved", badge);
    else dot.removeAttribute("data-review-approved");
  }
}

/** Строки легенды по зрителю: подписи дословно из эскиза. */
const LEGEND_ITEMS: Record<"reviewer" | "author", { badge: ApprovalBadge; text: string }[]> = {
  reviewer: [
    { badge: "all", text: "вы согласовали" },
    { badge: "stale", text: "изменено после вашей отметки" },
  ],
  author: [
    { badge: "all", text: "согласовали все" },
    { badge: "part", text: "согласовали не все" },
    { badge: "stale", text: "изменено после отметки" },
  ],
};

/** Дописывает строки отметок в легенду панели «Все вопросы». Повторный вызов ничего не дублирует. */
export function ensureApprovalLegend(doc: Document, viewer: "reviewer" | "author"): void {
  const legend = doc.querySelector<HTMLElement>("[data-qnav-panel] .tb-qnav__legend");
  if (!legend || legend.querySelector("[data-review-legend]")) return;
  for (const item of LEGEND_ITEMS[viewer]) {
    const el = doc.createElement("span");
    el.className = "ou-quiz__legend-item";
    el.setAttribute("data-review-legend", item.badge);
    const dot = doc.createElement("span");
    dot.className = "ou-quiz__legend-dot";
    dot.setAttribute("data-review-approved", item.badge);
    el.append(dot, doc.createTextNode(item.text));
    legend.append(el);
  }
}

/** Кладёт стиль бейджа в документ iframe один раз: стили проекта в кадр пакета не попадают. */
export function ensureApprovalStyle(doc: Document, css: string): void {
  if (doc.head.querySelector("style[data-review-approval]")) return;
  const style = doc.createElement("style");
  style.setAttribute("data-review-approval", "");
  style.textContent = css;
  doc.head.append(style);
}
