/**
 * @module tests/it/review-approvals-repository.it.test
 * @description PRD-52: слой данных отметок «Согласовано» на реальной базе (pglite). Круглый рейс обязателен: форма
 * правил держится на уникальном индексе и каскаде, которые видит только база.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { tests, testAccessGrants } from "@shared/schema";
import { createHarness, type Harness } from "./db-harness";

const h = vi.hoisted(() => ({ current: null as Harness | null }));
vi.mock("../../server/db", () => ({
  get db() {
    if (!h.current) throw new Error("harness not initialized");
    return h.current.db;
  },
}));

// eslint-disable-next-line import/first -- must import AFTER vi.mock
import { ReviewApprovalsRepository } from "../../server/storage/review-approvals-repository";
// eslint-disable-next-line import/first -- must import AFTER vi.mock
import { AccessRepository } from "../../server/storage/access-repository";

let repo: ReviewApprovalsRepository;
let access: AccessRepository;
let testId: string;

beforeAll(async () => {
  h.current = await createHarness();
  repo = new ReviewApprovalsRepository();
  access = new AccessRepository();
});
afterAll(async () => {
  await h.current!.close();
});
beforeEach(async () => {
  await h.current!.reset();
  testId = randomUUID();
  await h.current!.db.insert(tests).values([
    { id: testId, title: "Тест на согласование", overallPassRuleJson: { type: "percent", value: 80 } },
  ] as never);
});

function input(over: Record<string, unknown> = {}) {
  return {
    testId,
    reviewerId: "r1",
    anchorKind: "question" as const,
    anchorKey: "q1",
    questionId: "q1",
    topicId: "tp1",
    contentPageId: null,
    contextLabel: "Раздел «О компании» · Вопрос «…»",
    pinnedContentHash: "a".repeat(64),
    ...over,
  };
}

describe("upsertReviewApproval", () => {
  it("создаёт отметку со временем", async () => {
    const row = await repo.upsertReviewApproval(input());
    expect(row.id).toBeTruthy();
    expect(row.approvedAt).toBeInstanceOf(Date);
  });

  it("повтор с тем же хешем идемпотентен: строка и время те же", async () => {
    const first = await repo.upsertReviewApproval(input());
    const second = await repo.upsertReviewApproval(input());
    expect(second.id).toBe(first.id);
    expect(second.approvedAt.getTime()).toBe(first.approvedAt.getTime());
    expect(await repo.listReviewApprovals(testId)).toHaveLength(1);
  });

  it("повтор с другим хешем пересохраняет отметку: новое время и хеш", async () => {
    const first = await repo.upsertReviewApproval(input());
    await new Promise((r) => setTimeout(r, 15));
    const second = await repo.upsertReviewApproval(input({ pinnedContentHash: "b".repeat(64) }));
    expect(second.id).toBe(first.id);
    expect(second.pinnedContentHash).toBe("b".repeat(64));
    expect(second.approvedAt.getTime()).toBeGreaterThan(first.approvedAt.getTime());
  });

  it("у теста целиком и у вопроса разные отметки одного рецензента", async () => {
    await repo.upsertReviewApproval(input());
    await repo.upsertReviewApproval(
      input({ anchorKind: "test", anchorKey: "", questionId: null, topicId: null, pinnedContentHash: null }),
    );
    expect(await repo.listReviewApprovals(testId)).toHaveLength(2);
  });

  it("повтор отметки на тест целиком идемпотентен: у него нет хеша", async () => {
    const test = input({ anchorKind: "test", anchorKey: "", questionId: null, topicId: null, pinnedContentHash: null });
    const first = await repo.upsertReviewApproval(test);
    const second = await repo.upsertReviewApproval(test);
    expect(second.id).toBe(first.id);
    expect(second.approvedAt.getTime()).toBe(first.approvedAt.getTime());
  });

  it("у разных рецензентов отметки на один объект не мешают друг другу", async () => {
    await repo.upsertReviewApproval(input({ reviewerId: "r1" }));
    await repo.upsertReviewApproval(input({ reviewerId: "r2" }));
    expect(await repo.listReviewApprovals(testId)).toHaveLength(2);
  });
});

describe("listReviewApprovals", () => {
  it("с фильтром по рецензенту отдаёт только его строки", async () => {
    await repo.upsertReviewApproval(input({ reviewerId: "r1" }));
    await repo.upsertReviewApproval(input({ reviewerId: "r2" }));
    const own = await repo.listReviewApprovals(testId, { reviewerId: "r1" });
    expect(own.map((r) => r.reviewerId)).toEqual(["r1"]);
  });
});

describe("deleteReviewApproval", () => {
  it("удаляет строку и сообщает об этом", async () => {
    const row = await repo.upsertReviewApproval(input());
    expect(await repo.deleteReviewApproval(row.id)).toBe(true);
    expect(await repo.getReviewApproval(row.id)).toBeUndefined();
    expect(await repo.deleteReviewApproval(row.id)).toBe(false);
  });
});

describe("каскад", () => {
  it("удаление теста забирает его отметки", async () => {
    await repo.upsertReviewApproval(input());
    await h.current!.db.delete(tests);
    expect(await repo.listReviewApprovals(testId)).toHaveLength(0);
  });
});

describe("markReviewGrantAccepted", () => {
  async function grant(level: "review" | "edit") {
    await h.current!.db.insert(testAccessGrants).values({
      id: randomUUID(), testId, userId: "r1", accessLevel: level, grantedBy: "author-1",
    } as never);
  }

  it("ставит время при первом обращении держателя гранта review", async () => {
    await grant("review");
    await access.markReviewGrantAccepted(testId, "r1");
    const [row] = await h.current!.db.select().from(testAccessGrants);
    expect(row.acceptedAt).toBeInstanceOf(Date);
  });

  it("повторное обращение время не меняет", async () => {
    await grant("review");
    await access.markReviewGrantAccepted(testId, "r1");
    const [first] = await h.current!.db.select().from(testAccessGrants);
    await new Promise((r) => setTimeout(r, 15));
    await access.markReviewGrantAccepted(testId, "r1");
    const [second] = await h.current!.db.select().from(testAccessGrants);
    expect(second.acceptedAt!.getTime()).toBe(first.acceptedAt!.getTime());
  });

  it("грант другого уровня не затрагивает", async () => {
    await grant("edit");
    await access.markReviewGrantAccepted(testId, "r1");
    const [row] = await h.current!.db.select().from(testAccessGrants);
    expect(row.acceptedAt).toBeNull();
  });
});
