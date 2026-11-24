/**
 * @module server/storage/review-approvals-repository
 * @description Слой данных ОТМЕТОК «Согласовано» (PRD-52, спека 2026-11-23-review-approval-flag-design).
 *
 * Отметка принадлежит паре «рецензент - объект». Повторная отметка с тем же хешем содержимого идемпотентна и
 * время не меняет; с другим хешем (отметка устарела) пересохраняется как «согласовано снова». Какие строки
 * видит зритель, решает маршрут: слой данных отдаёт то, что просят.
 *
 * Выставляется через фасад `IStorage`, маршрутами напрямую не импортируется.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  testReviewApprovals,
  type TestReviewApproval,
  type InsertTestReviewApproval,
} from "@shared/schema";

/** Поля, которые задаёт вызывающий; идентификатор и время ставит слой данных. */
export type ReviewApprovalInput = Omit<InsertTestReviewApproval, "id" | "approvedAt">;

export class ReviewApprovalsRepository {
  /** Отметки теста по возрастанию времени; с фильтром - только одного рецензента. */
  async listReviewApprovals(testId: string, filter?: { reviewerId?: string }): Promise<TestReviewApproval[]> {
    const where = filter?.reviewerId
      ? and(eq(testReviewApprovals.testId, testId), eq(testReviewApprovals.reviewerId, filter.reviewerId))
      : eq(testReviewApprovals.testId, testId);
    return db.select().from(testReviewApprovals).where(where).orderBy(asc(testReviewApprovals.approvedAt));
  }

  /** Одна отметка по идентификатору. */
  async getReviewApproval(id: string): Promise<TestReviewApproval | undefined> {
    const [row] = await db.select().from(testReviewApprovals).where(eq(testReviewApprovals.id, id));
    return row;
  }

  /**
   * Поставить отметку. Нет строки - создаётся; есть с тем же хешем - возвращается как есть (идемпотентность,
   * время не меняется); есть с другим хешем - хеш, контекст и время обновляются.
   */
  async upsertReviewApproval(input: ReviewApprovalInput): Promise<TestReviewApproval> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(testReviewApprovals)
        .where(
          and(
            eq(testReviewApprovals.testId, input.testId),
            eq(testReviewApprovals.reviewerId, input.reviewerId),
            eq(testReviewApprovals.anchorKind, input.anchorKind),
            eq(testReviewApprovals.anchorKey, input.anchorKey ?? ""),
          ),
        );
      if (!existing) {
        // Время ставит приложение, а не `DEFAULT now()` базы: сервер БД может жить в другом часовом поясе, и
        // тогда создание (время базы) и пересохранение (время приложения) шли бы в разных шкалах.
        const [created] = await tx
          .insert(testReviewApprovals)
          .values({ ...input, id: randomUUID(), approvedAt: new Date() })
          .returning();
        return created;
      }
      if ((existing.pinnedContentHash ?? null) === (input.pinnedContentHash ?? null)) return existing;
      const [updated] = await tx
        .update(testReviewApprovals)
        .set({
          pinnedContentHash: input.pinnedContentHash ?? null,
          contextLabel: input.contextLabel ?? null,
          approvedAt: new Date(),
        })
        .where(eq(testReviewApprovals.id, existing.id))
        .returning();
      return updated;
    });
  }

  /** Удалить отметку по идентификатору. Права проверяет маршрут. */
  async deleteReviewApproval(id: string): Promise<boolean> {
    const deleted = await db
      .delete(testReviewApprovals)
      .where(eq(testReviewApprovals.id, id))
      .returning({ id: testReviewApprovals.id });
    return deleted.length > 0;
  }
}
