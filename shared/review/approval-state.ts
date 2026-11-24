/**
 * @module shared/review/approval-state
 *
 * PRD-52: правило бейджа «Согласовано». ОДНО на клиент и на тесты сервера, чтобы окно рецензента, карта вопросов
 * и таблицы редактора не разошлись в том, что считается согласованием.
 *
 * Рецензент не видит чужих отметок (решение владельца 2026-11-23), поэтому правил два: для него бейдж описывает
 * только его собственную отметку, для автора и владельца - круг рецензентов.
 */

/** Вид бейджа: `all` - сплошной, `part` - контурный, `stale` - пунктирный. Нет бейджа - `null`. */
export type ApprovalBadge = "all" | "part" | "stale";

/** Минимум, который нужен правилу от строки отметки. */
export interface ApprovalRow {
  reviewerId: string;
  /** Объект менялся после отметки (хеш разошёлся); считает сервер при чтении. */
  stale: boolean;
}

/** Бейдж для рецензента: только его собственная отметка. */
export function badgeForReviewer(own: ApprovalRow | undefined): ApprovalBadge | null {
  if (!own) return null;
  return own.stale ? "stale" : "all";
}

/**
 * Круг рецензентов объекта: принявшие приглашение плюс все, кто поставил отметку. Поставивший отметку считается
 * принявшим всегда - иначе счётчик показал бы согласовавших больше, чем принявших.
 */
export function circleOf(rows: readonly ApprovalRow[], acceptedReviewerIds: readonly string[]): string[] {
  return [...new Set([...acceptedReviewerIds, ...rows.map((r) => r.reviewerId)])];
}

/** Бейдж для автора и владельца: состояние круга рецензентов. */
export function badgeForAuthor(
  rows: readonly ApprovalRow[],
  acceptedReviewerIds: readonly string[],
): ApprovalBadge | null {
  if (rows.length === 0) return null;
  const active = new Set(rows.filter((r) => !r.stale).map((r) => r.reviewerId));
  if (active.size === 0) return "stale";
  const circle = circleOf(rows, acceptedReviewerIds);
  return circle.every((id) => active.has(id)) ? "all" : "part";
}
