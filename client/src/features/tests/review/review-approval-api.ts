/**
 * @module features/tests/review/review-approval-api
 * @description PRD-52: клиентские запросы к API отметок «Согласовано» и форма ответа сервера.
 *
 * Один модуль на все места экрана (окно рецензирования, вкладка редактора, бейджи на карте вопросов): форма
 * ответа и адреса маршрутов не должны повторяться в нескольких местах.
 */
import { apiRequest } from "@/lib/queryClient";
import type { ReviewAnchor, ReviewAnchorKind } from "@shared/review/anchor";

/** Отметка как её отдаёт сервер. */
export interface ReviewApproval {
  id: string;
  testId: string;
  reviewerId: string;
  reviewerName?: string | null;
  anchorKind: ReviewAnchorKind;
  anchorKey: string;
  questionId: string | null;
  topicId: string | null;
  contentPageId: string | null;
  contextLabel: string | null;
  pinnedContentHash: string | null;
  approvedAt: string;
  /** Объект менялся после отметки. */
  stale: boolean;
  /** Объект удалён из теста. */
  orphaned: boolean;
}

/** Рецензент в ответе автору: приглашённые и поставившие отметку; `accepted` - вошёл в круг счётчика. */
export interface ReviewerEntry {
  userId: string;
  name: string | null;
  accepted: boolean;
}

/** Ответ `GET`: зритель, отметки и (только автору) рецензенты. */
export interface ReviewApprovalsResponse {
  viewer: "author" | "reviewer";
  approvals: ReviewApproval[];
  reviewers?: ReviewerEntry[];
}

/** Ключ кэша отметок теста - общий для всех мест экрана. */
export const reviewApprovalsKey = (testId: string) => ["tests", testId, "review-approvals"] as const;

export async function fetchReviewApprovals(testId: string): Promise<ReviewApprovalsResponse> {
  const res = await apiRequest("GET", `/api/tests/${testId}/review/approvals`);
  return (await res.json()) as ReviewApprovalsResponse;
}

export async function putReviewApproval(testId: string, anchor: ReviewAnchor): Promise<ReviewApproval> {
  const res = await apiRequest("PUT", `/api/tests/${testId}/review/approvals`, { anchor });
  return (await res.json()) as ReviewApproval;
}

export async function deleteReviewApproval(testId: string, approvalId: string): Promise<void> {
  await apiRequest("DELETE", `/api/tests/${testId}/review/approvals/${approvalId}`);
}
