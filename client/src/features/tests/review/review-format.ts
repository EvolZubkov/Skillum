/**
 * @module features/tests/review/review-format
 * @description PRD-52: общие форматтеры рецензирования - инициалы для аватара и дата в том виде, в каком её читают
 * в списке. Живут отдельно, потому что их зовут и лента комментариев, и карточки согласования: две копии
 * разошлись бы в мелочи, которую человек заметит сразу (одна и та же дата написана по-разному в соседних блоках).
 */

/**
 * Инициалы для аватара. Имя может не прийти вовсе (пользователь удалён, ответ сервера без него) - тогда кружок
 * остаётся пустым, но с места не уходит: строка не должна прыгать из-за отсутствующего имени.
 */
export function initialsOf(name: string | null | undefined, mine: boolean): string {
  const source = (name ?? "").trim() || (mine ? "Вы" : "");
  if (!source) return "";
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** Дата в том виде, в каком её читают в списке: «2 сентября, 14:20». */
export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/** Короткая дата для ячейки матрицы: «21.11 18:44». */
export function shortWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
