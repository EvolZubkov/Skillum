/**
 * @module features/tests/review/use-review-approvals
 * @description PRD-52: отметки «Согласовано» теста - загрузка и мутации. Кэш общий для всех мест экрана: карточек
 * окна рецензирования, вкладки редактора и бейджей на карте вопросов.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchReviewApprovals, putReviewApproval, deleteReviewApproval, reviewApprovalsKey, reviewApprovalsPrefix,
  type ReviewApprovalsView,
} from "./review-approval-api";
import type { ReviewAnchor } from "@shared/review/anchor";

export interface UseReviewApprovalsOptions {
  enabled?: boolean;
  /** Вид отметок: окно рецензирования просит `reviewer`, остальные экраны - `auto` (по умолчанию). */
  view?: ReviewApprovalsView;
}

export function useReviewApprovals(testId: string, options: UseReviewApprovalsOptions = {}) {
  const queryClient = useQueryClient();
  const enabled = options.enabled !== false && Boolean(testId);
  const view = options.view ?? "auto";

  const query = useQuery({
    queryKey: reviewApprovalsKey(testId, view),
    queryFn: () => fetchReviewApprovals(testId, view),
    enabled,
  });

  // Сбрасывается кэш обоих видов: у одного человека могут быть открыты оба.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: reviewApprovalsPrefix(testId) });

  const approve = useMutation({
    mutationFn: (anchor: ReviewAnchor) => putReviewApproval(testId, anchor),
    onSuccess: invalidate,
  });

  const withdraw = useMutation({
    mutationFn: (approvalId: string) => deleteReviewApproval(testId, approvalId),
    onSuccess: invalidate,
  });

  return {
    /** Кто смотрит: от этого зависит и вид экрана, и правило бейджа. `null`, пока ответ не пришёл. */
    viewer: query.data?.viewer ?? null,
    approvals: query.data?.approvals ?? [],
    /** Все приглашённые и поставившие отметку - только у автора. */
    reviewers: query.data?.reviewers ?? [],
    /** Круг счётчика «согласовали N из M»: принявшие приглашение и поставившие отметку. */
    circle: (query.data?.reviewers ?? []).filter((r) => r.accepted),
    /**
     * Есть ли у теста рецензенты, о которых стоит говорить: рецензент по определению, а автору - если в круге
     * есть хоть один принявший приглашение или поставивший отметку. Пока никто не пришёл, согласования нет, есть
     * только возможность оставлять комментарии: блок, легенда и пункт редактора не показываются.
     */
    hasReviewers:
      query.data?.viewer === "reviewer" ||
      (query.data?.reviewers ?? []).some((r) => r.accepted),
    isLoading: query.isLoading,
    error: query.error as Error | null,
    approve,
    withdraw,
  };
}
