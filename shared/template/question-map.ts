/**
 * @module shared/template/question-map
 *
 * Paging arithmetic of the question map (the dots row in the scene header).
 *
 * A test with many questions used to push the header taller and squeeze the question
 * out of the screen, because the map printed one dot per question and wrapped them.
 * The map now shows a PAGE of dots (10 on a wide scene, 5 on a narrow one) with
 * previous/next arrows, and a «Все вопросы» panel that holds every dot at once.
 *
 * This module is the pure half: page size, page of a question, the range caption and the
 * «is paging needed at all» rule. The DOM half is {@link module:shared/template/question-map-dom}.
 * Both hosts (web Shadow DOM and the SCORM package) use the same pair, so the map pages
 * identically in the browser and in an LMS.
 *
 * Pure — no DOM, no host globals.
 */

/** Dots per page on a wide scene. Fixed (not derived from the width) so the page borders stay stable. */
export const QNAV_PAGE_SIZE = 10;

/** Dots per page on a narrow scene. */
export const QNAV_PAGE_SIZE_NARROW = 5;

/** Scene width (px) at and below which the narrow page size applies — the layout's phone step. */
export const QNAV_NARROW_MAX_WIDTH = 520;

/**
 * Page size for a scene of the given width.
 *
 * @param width Scene width in CSS pixels; `0`, a negative or a non-finite value means
 *   «not measured» (a detached or not yet laid out node) and yields the wide size.
 * @returns Dots per page.
 */
export function pageSizeFor(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return QNAV_PAGE_SIZE;
  return width <= QNAV_NARROW_MAX_WIDTH ? QNAV_PAGE_SIZE_NARROW : QNAV_PAGE_SIZE;
}

/**
 * Whether the map needs paging: only when the questions do not fit on one page.
 *
 * @param total Number of questions in the map.
 * @param size Dots per page.
 * @returns `true` when there is more than one page.
 */
export function needsPaging(total: number, size: number): boolean {
  return size > 0 && total > size;
}

/**
 * Number of pages.
 *
 * @param total Number of questions in the map.
 * @param size Dots per page.
 * @returns Page count, at least 1.
 */
export function pageCount(total: number, size: number): number {
  if (size <= 0 || total <= 0) return 1;
  return Math.ceil(total / size);
}

/**
 * Zero-based page that holds a question.
 *
 * @param number One-based question number as printed on its dot.
 * @param size Dots per page.
 * @returns Page index, never negative.
 */
export function pageOf(number: number, size: number): number {
  if (size <= 0 || !Number.isFinite(number) || number < 1) return 0;
  return Math.floor((number - 1) / size);
}

/**
 * Clamp a page index into the valid range.
 *
 * @param page Requested page index.
 * @param total Number of questions in the map.
 * @param size Dots per page.
 * @returns A page index that exists.
 */
export function clampPage(page: number, total: number, size: number): number {
  const last = pageCount(total, size) - 1;
  if (!Number.isFinite(page)) return 0;
  return Math.min(Math.max(Math.trunc(page), 0), last);
}

/**
 * Caption of a page: «11–17 из 17».
 *
 * @param page Zero-based page index.
 * @param total Number of questions in the map.
 * @param size Dots per page.
 * @returns The caption with an en dash between the borders.
 */
export function rangeLabel(page: number, total: number, size: number): string {
  const from = page * size + 1;
  const to = Math.min((page + 1) * size, total);
  return `${from}–${to} из ${total}`;
}
