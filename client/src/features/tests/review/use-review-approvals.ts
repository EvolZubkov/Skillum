/**
 * @module features/tests/review/use-review-approvals
 * @description PRD-52: отметки «Согласовано» теста - загрузка и мутации. Кэш общий для всех мест экрана: карточек
 * окна рецензирования, вкладки редактора и бейджей на карте вопросов.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchReviewApprovals, putReviewApproval, deleteReviewApproval, reviewApprovalsKey,
} from "./review-approval-api";
import type { ReviewAnchor } from "@shared/review/anchor";

export function useReviewApprovals(testId: string, options: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const enabled = options.enabled !== false && Boolean(testId);

  const query = useQuery({
    queryKey: reviewApprovalsKey(testId),
    queryFn: () => fetchReviewApprovals(testId),
    enabled,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: reviewApprovalsKey(testId) });

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
    isLoading: query.isLoading,
    error: query.error as Error | null,
    approve,
    withdraw,
  };
}
