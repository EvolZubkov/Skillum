/**
 * @module features/tests/review/review-approval-model
 * @description PRD-52: чистая подготовка данных согласования для экрана - поиск отметки по якорю, сводка по
 * разделам, матрица «вопрос - рецензент» и фильтр. Состояние строки считает то же правило, что рисует бейдж на
 * карте (`shared/review/approval-state`), поэтому таблица и карта не расходятся.
 */
import { anchorKeyOf, type ReviewAnchor } from "@shared/review/anchor";
import { badgeForAuthor, type ApprovalBadge } from "@shared/review/approval-state";
import type { ReviewApproval } from "./review-approval-api";

/** Отметка по якорю: в рамках одного зрителя она единственная. */
export function findApproval(
  approvals: readonly ReviewApproval[],
  anchor: ReviewAnchor,
): ReviewApproval | undefined {
  const key = anchorKeyOf(anchor);
  return approvals.find((a) => a.anchorKind === anchor.kind && a.anchorKey === key);
}

/** Все отметки по якорю - для автора, которому видны отметки каждого рецензента. */
export function approvalsAt(approvals: readonly ReviewApproval[], anchor: ReviewAnchor): ReviewApproval[] {
  const key = anchorKeyOf(anchor);
  return approvals.filter((a) => a.anchorKind === anchor.kind && a.anchorKey === key);
}

/** Раздел и его вопросы - то, что знает ящик теста. */
export interface SectionInput {
  topicId: string;
  title: string;
  questions: { id: string; label: string }[];
}

/** Ячейка матрицы: отметка рецензента или `null`. */
export type MatrixCell = { approvedAt: string; stale: boolean } | null;

export interface MatrixRow {
  questionId: string;
  label: string;
  /** По идентификатору рецензента. */
  cells: Record<string, MatrixCell>;
  state: ApprovalBadge | null;
}

export interface SectionSummary {
  topicId: string;
  title: string;
  total: number;
  /** Согласовали все. */
  all: number;
  /** Согласовала часть. */
  part: number;
  /** Объект менялся после отметок. */
  stale: number;
  /** Нет ни одной отметки. */
  none: number;
  rows: MatrixRow[];
}

/**
 * Сводка по разделам для автора. `reviewerIds` - круг рецензентов (принявшие и поставившие отметки): по нему
 * строятся столбцы матрицы и считается, все ли согласовали.
 */
export function buildApprovalSections(
  sections: readonly SectionInput[],
  approvals: readonly ReviewApproval[],
  reviewerIds: readonly string[],
): SectionSummary[] {
  return sections.map((section) => {
    const rows: MatrixRow[] = section.questions.map((q) => {
      const mine = approvals.filter((a) => a.anchorKind === "question" && a.anchorKey === q.id);
      const cells: Record<string, MatrixCell> = {};
      for (const id of reviewerIds) {
        const a = mine.find((m) => m.reviewerId === id);
        cells[id] = a ? { approvedAt: a.approvedAt, stale: a.stale } : null;
      }
      return { questionId: q.id, label: q.label, cells, state: badgeForAuthor(mine, reviewerIds) };
    });
    const count = (state: ApprovalBadge | null) => rows.filter((r) => r.state === state).length;
    return {
      topicId: section.topicId,
      title: section.title,
      total: rows.length,
      all: count("all"),
      part: count("part"),
      stale: count("stale"),
      none: count(null),
      rows,
    };
  });
}

export type ApprovalFilterMode = "attn" | "all" | "none" | "stale";

export interface ApprovalFilter {
  mode: ApprovalFilterMode;
  query: string;
  /** Только строки, где этот рецензент ещё не согласовал или согласовал до правки; `null` - без фильтра. */
  reviewerId: string | null;
}

/** Применяет фильтр; раздел без подходящих строк скрывается и считается в `hidden`. */
export function filterSections(
  sections: readonly SectionSummary[],
  filter: ApprovalFilter,
): { sections: SectionSummary[]; hidden: number } {
  const query = filter.query.trim().toLowerCase();
  const keep = (row: MatrixRow): boolean => {
    if (query && !row.label.toLowerCase().includes(query)) return false;
    if (filter.reviewerId) {
      const cell = row.cells[filter.reviewerId];
      if (cell && !cell.stale) return false;
    }
    switch (filter.mode) {
      case "attn":
        return row.state !== "all";
      case "none":
        return row.state === null;
      case "stale":
        return row.state === "stale";
      default:
        return true;
    }
  };

  const result: SectionSummary[] = [];
  let hidden = 0;
  for (const section of sections) {
    const rows = section.rows.filter(keep);
    if (rows.length === 0) hidden += 1;
    else result.push({ ...section, rows });
  }
  return { sections: result, hidden };
}
