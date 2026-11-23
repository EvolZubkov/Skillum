/**
 * @module features/tests/review/approval-tooltip-model
 * @description PRD-52 (issue #62): content of the author's tooltip over a question dot of the question map -
 * «Вопрос N», «Согласовали K из M» and one row per reviewer of the circle. Pure: the host window draws it.
 *
 * Wireframe: `docs/wireframes/approved/prd52-review-approval.html`, state «окно автора».
 */
import type { ReviewApproval, ReviewerEntry } from "./review-approval-api";

/** One reviewer row: a mark (`iso` set) or «не согласовал» (`iso` is `null`). */
export interface ApprovalTooltipRow {
  userId: string;
  name: string;
  iso: string | null;
  /** The question changed after this mark: it does not count towards «Согласовали». */
  stale: boolean;
}

export interface ApprovalTooltip {
  title: string;
  subtitle: string;
  rows: ApprovalTooltipRow[];
}

/**
 * Builds the tooltip of the question with the given id. `null` when the circle is empty: there is nobody to
 * count against, so a «0 из 0» tooltip would say nothing.
 */
export function buildApprovalTooltip(
  number: number,
  questionId: string,
  approvals: readonly ReviewApproval[],
  circle: readonly ReviewerEntry[],
): ApprovalTooltip | null {
  const marks = approvals.filter((a) => a.anchorKind === "question" && a.questionId === questionId && !a.orphaned);
  const byReviewer = new Map(marks.map((a) => [a.reviewerId, a]));

  // The circle is the denominator; a reviewer who marked but is missing from it (defensive) is still listed.
  const members = [...circle];
  for (const a of marks) {
    if (!members.some((m) => m.userId === a.reviewerId)) {
      members.push({ userId: a.reviewerId, name: a.reviewerName ?? null, accepted: true });
    }
  }
  if (members.length === 0) return null;

  const rows = members.map<ApprovalTooltipRow>((m) => {
    const mark = byReviewer.get(m.userId);
    return {
      userId: m.userId,
      name: (m.name ?? mark?.reviewerName ?? "").trim(),
      iso: mark?.approvedAt ?? null,
      stale: mark?.stale ?? false,
    };
  });
  // Marked first, earliest first; the rest keep the circle order.
  rows.sort((a, b) => {
    if (a.iso && b.iso) return a.iso.localeCompare(b.iso);
    if (a.iso) return -1;
    if (b.iso) return 1;
    return 0;
  });

  const counted = rows.filter((r) => r.iso && !r.stale).length;
  return { title: `Вопрос ${number}`, subtitle: `Согласовали ${counted} из ${members.length}`, rows };
}
