/**
 * @module tests/review-approvals-routes
 *
 * PRD-52, спека 2026-11-23-review-approval-flag-design: API отметок «Согласовано». Проверяются правила, которые
 * больше нигде не живут: рецензент видит только СВОИ отметки (фильтр на сервере), ставит и снимает отметку
 * только держатель гранта `review`, чужую отметку не снимает никто (включая владельца теста), чтение фиксирует
 * принятие приглашения.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { ROLES } from "@shared/access";

vi.hoisted(() => { process.env.DATABASE_URL = "postgresql://fake/test"; });

const { storageMock, accessMock, anchorMock } = vi.hoisted(() => ({
  storageMock: {
    getUser: vi.fn(),
    getUserRoles: vi.fn(),
    getTest: vi.fn(),
    getTestGrantForUser: vi.fn(),
    getTestReviewGrant: vi.fn(),
    getTestAccessGrants: vi.fn(),
    listReviewThreads: vi.fn(),
    listReviewApprovals: vi.fn(),
    getReviewApproval: vi.fn(),
    upsertReviewApproval: vi.fn(),
    deleteReviewApproval: vi.fn(),
    markReviewGrantAccepted: vi.fn(),
  },
  accessMock: { canReviewTest: vi.fn(), canEditTest: vi.fn(), canGrantAccess: vi.fn() },
  anchorMock: {
    describeAnchor: vi.fn(), isAnchorStale: vi.fn(), isAnchorOrphaned: vi.fn(),
    anchorChangedAt: vi.fn(),
    // The real rule: the time counts only when it is AFTER the mark (see review-anchor).
    changedAfter: (changedAt: Date | null, approvedAt: Date) =>
      changedAt && changedAt.getTime() > approvedAt.getTime() ? changedAt : null,
  },
}));

vi.mock("../server/storage", () => ({ storage: storageMock }));
vi.mock("../server/services/test-access", () => accessMock);
vi.mock("../server/services/review-anchor", () => anchorMock);
vi.mock("../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  audit: { participantLinksExported: vi.fn() },
}));
vi.mock("../server/scorm/build-export-data", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildScormExportData: vi.fn(),
}));
vi.mock("../server/scorm-exporter", () => ({ generateScormPackage: vi.fn() }));
vi.mock("../server/scorm/debug-player/session-store", () => ({
  createDebugSession: vi.fn(),
  getDebugSession: vi.fn(),
  dropDebugSession: vi.fn(),
}));
vi.mock("../server/services/draw-feasibility", () => ({ assessTestPublish: vi.fn() }));
vi.mock("../server/scorm/debug-player/assets", () => ({
  readShimJs: vi.fn(),
  readInspectorComputeJs: vi.fn(),
}));

import reviewRouter from "../server/routes/review";

const TEST = { id: "t1", ownerId: "author-1" };

/** Приложение с сессией фиксированного пользователя. */
function makeApp(userId: string) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.session.userId = userId; next(); });
  app.use("/api/tests", reviewRouter);
  return app;
}

const expertApp = () => makeApp("expert-1");
const authorApp = () => makeApp("author-1");

/** Отметка рецензента на вопрос. */
function approval(over: Record<string, unknown> = {}) {
  return {
    id: "a1", testId: "t1", reviewerId: "expert-1", anchorKind: "question", anchorKey: "q1",
    questionId: "q1", topicId: "tp1", contentPageId: null,
    contextLabel: "Раздел «О компании» · Вопрос «…»", pinnedContentHash: "a".repeat(64),
    approvedAt: new Date("2026-11-21T18:40:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getUser.mockImplementation(async (id: string) => ({
    id, status: "active", email: `${id}@x`,
    name: id === "expert-1" ? "Ирина Петрова" : id === "expert-2" ? "Сергей Ковалёв" : "Автор Теста",
  }));
  storageMock.getUserRoles.mockResolvedValue([ROLES.AUTHOR]);
  storageMock.getTest.mockResolvedValue(TEST);
  storageMock.getTestGrantForUser.mockResolvedValue(undefined);
  storageMock.listReviewThreads.mockResolvedValue([]);
  storageMock.listReviewApprovals.mockImplementation(
    async (_testId: string, filter?: { reviewerId?: string }) =>
      [approval(), approval({ id: "a2", reviewerId: "expert-2" })]
        .filter((row) => !filter?.reviewerId || row.reviewerId === filter.reviewerId),
  );
  storageMock.getReviewApproval.mockResolvedValue(approval());
  storageMock.upsertReviewApproval.mockImplementation(async (input: Record<string, unknown>) => approval(input));
  storageMock.deleteReviewApproval.mockResolvedValue(true);
  storageMock.markReviewGrantAccepted.mockResolvedValue(undefined);
  storageMock.getTestReviewGrant.mockImplementation(
    async (_testId: string, userId: string) => (userId.startsWith("expert") ? { accessLevel: "review" } : undefined),
  );
  storageMock.getTestAccessGrants.mockResolvedValue([
    { testId: "t1", userId: "expert-1", accessLevel: "review", acceptedAt: new Date("2026-11-20") },
    { testId: "t1", userId: "expert-2", accessLevel: "review", acceptedAt: null },
    { testId: "t1", userId: "expert-3", accessLevel: "review", acceptedAt: null },
  ]);
  accessMock.canReviewTest.mockResolvedValue(true);
  accessMock.canEditTest.mockImplementation(async (_r: unknown, userId: string) => userId === "author-1");
  accessMock.canGrantAccess.mockImplementation((_r: unknown, userId: string) => userId === "author-1");
  anchorMock.describeAnchor.mockResolvedValue({
    contextLabel: "Раздел «О компании» · Вопрос «…»", pinnedContentHash: "a".repeat(64),
  });
  anchorMock.isAnchorStale.mockResolvedValue(false);
  anchorMock.isAnchorOrphaned.mockResolvedValue(false);
});

describe("GET /:id/review/approvals", () => {
  it("рецензенту отдаёт только его строки и не отдаёт список рецензентов", async () => {
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.status).toBe(200);
    expect(res.body.viewer).toBe("reviewer");
    expect(res.body.approvals.map((a: { reviewerId: string }) => a.reviewerId)).toEqual(["expert-1"]);
    expect(res.body.reviewers).toBeUndefined();
  });

  it("запрашивает у хранилища только строки самого рецензента", async () => {
    await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(storageMock.listReviewApprovals).toHaveBeenCalledWith("t1", { reviewerId: "expert-1" });
  });

  it("автору отдаёт все строки и всех приглашённых рецензентов", async () => {
    const res = await request(authorApp()).get("/api/tests/t1/review/approvals");
    expect(res.body.viewer).toBe("author");
    expect(res.body.approvals).toHaveLength(2);
    expect(storageMock.listReviewApprovals).toHaveBeenCalledWith("t1", undefined);
    expect(res.body.reviewers.map((r: { userId: string }) => r.userId).sort())
      .toEqual(["expert-1", "expert-2", "expert-3"]);
  });

  it("отмечает, кто принял приглашение: открывший окно или поставивший отметку", async () => {
    const res = await request(authorApp()).get("/api/tests/t1/review/approvals");
    const accepted = Object.fromEntries(
      res.body.reviewers.map((r: { userId: string; accepted: boolean }) => [r.userId, r.accepted]),
    );
    // expert-1 открыл окно, expert-2 не открывал, но поставил отметку, expert-3 не сделал ничего.
    expect(accepted).toEqual({ "expert-1": true, "expert-2": true, "expert-3": false });
  });

  it("подписывает отметку именем рецензента", async () => {
    const res = await request(authorApp()).get("/api/tests/t1/review/approvals");
    expect(res.body.approvals[0].reviewerName).toBe("Ирина Петрова");
  });

  it("помечает отметку устаревшей, когда содержимое разошлось с пином", async () => {
    anchorMock.isAnchorStale.mockResolvedValue(true);
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.body.approvals[0].stale).toBe(true);
  });

  it("называет время правки у устаревшей отметки (issue 61)", async () => {
    anchorMock.isAnchorStale.mockResolvedValue(true);
    anchorMock.anchorChangedAt.mockResolvedValue(new Date("2026-11-23T09:10:00Z"));
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.body.approvals[0].changedAt).toBe("2026-11-23T09:10:00.000Z");
  });

  it("не отдаёт время правки, когда оно неизвестно или не позже отметки", async () => {
    anchorMock.isAnchorStale.mockResolvedValue(true);
    anchorMock.anchorChangedAt.mockResolvedValue(null);
    expect((await request(expertApp()).get("/api/tests/t1/review/approvals")).body.approvals[0].changedAt).toBeNull();
    anchorMock.anchorChangedAt.mockResolvedValue(new Date("2026-11-20T00:00:00Z"));
    expect((await request(expertApp()).get("/api/tests/t1/review/approvals")).body.approvals[0].changedAt).toBeNull();
  });

  it("у отметки, не устаревшей, времени правки нет", async () => {
    anchorMock.isAnchorStale.mockResolvedValue(false);
    anchorMock.anchorChangedAt.mockResolvedValue(new Date("2026-11-23T09:10:00Z"));
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.body.approvals[0].changedAt).toBeNull();
  });

  it("помечает отметку осиротевшей, когда объект удалён", async () => {
    anchorMock.isAnchorOrphaned.mockResolvedValue(true);
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.body.approvals[0].orphaned).toBe(true);
  });

  it("фиксирует принятие приглашения", async () => {
    await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(storageMock.markReviewGrantAccepted).toHaveBeenCalledWith("t1", "expert-1");
  });

  it("чтение ленты комментариев тоже фиксирует принятие", async () => {
    await request(expertApp()).get("/api/tests/t1/review/comments");
    expect(storageMock.markReviewGrantAccepted).toHaveBeenCalledWith("t1", "expert-1");
  });

  it("сбой записи принятия не роняет чтение", async () => {
    storageMock.markReviewGrantAccepted.mockRejectedValue(new Error("db down"));
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.status).toBe(200);
  });

  it("без доступа к рецензированию отказывает", async () => {
    accessMock.canReviewTest.mockResolvedValue(false);
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.status).toBe(403);
  });
});

describe("PUT /:id/review/approvals", () => {
  const body = { anchor: { kind: "question", questionId: "q1", topicId: "tp1" } };

  it("ставит отметку со снимком контекста и хешем", async () => {
    const res = await request(expertApp()).put("/api/tests/t1/review/approvals").send(body);
    expect(res.status).toBe(200);
    expect(storageMock.upsertReviewApproval).toHaveBeenCalledWith(expect.objectContaining({
      testId: "t1", reviewerId: "expert-1", anchorKind: "question", anchorKey: "q1",
      questionId: "q1", topicId: "tp1",
      contextLabel: "Раздел «О компании» · Вопрос «…»", pinnedContentHash: "a".repeat(64),
    }));
  });

  it("владельцу теста без гранта review отказывает: отметок автор не ставит", async () => {
    const res = await request(authorApp()).put("/api/tests/t1/review/approvals").send(body);
    expect(res.status).toBe(403);
    expect(storageMock.upsertReviewApproval).not.toHaveBeenCalled();
  });

  it("отвергает место без идентификатора объекта", async () => {
    const res = await request(expertApp()).put("/api/tests/t1/review/approvals")
      .send({ anchor: { kind: "question" } });
    expect(res.status).toBe(400);
    expect(storageMock.upsertReviewApproval).not.toHaveBeenCalled();
  });

  it("отвергает запрос без места", async () => {
    const res = await request(expertApp()).put("/api/tests/t1/review/approvals").send({});
    expect(res.status).toBe(400);
  });

  it("отвергает удалённый объект", async () => {
    anchorMock.isAnchorOrphaned.mockResolvedValue(true);
    const res = await request(expertApp()).put("/api/tests/t1/review/approvals").send(body);
    expect(res.status).toBe(422);
    expect(storageMock.upsertReviewApproval).not.toHaveBeenCalled();
  });

  it("у теста целиком ключ якоря пустой", async () => {
    await request(expertApp()).put("/api/tests/t1/review/approvals").send({ anchor: { kind: "test" } });
    expect(storageMock.upsertReviewApproval).toHaveBeenCalledWith(
      expect.objectContaining({ anchorKind: "test", anchorKey: "" }),
    );
  });

  it("фиксирует принятие приглашения", async () => {
    await request(expertApp()).put("/api/tests/t1/review/approvals").send(body);
    expect(storageMock.markReviewGrantAccepted).toHaveBeenCalledWith("t1", "expert-1");
  });
});

describe("DELETE /:id/review/approvals/:approvalId", () => {
  it("снимает свою отметку", async () => {
    const res = await request(expertApp()).delete("/api/tests/t1/review/approvals/a1");
    expect(res.status).toBe(200);
    expect(storageMock.deleteReviewApproval).toHaveBeenCalledWith("a1");
  });

  it("чужую отметку не снимает никто, включая владельца теста", async () => {
    const res = await request(authorApp()).delete("/api/tests/t1/review/approvals/a1");
    expect(res.status).toBe(403);
    expect(storageMock.deleteReviewApproval).not.toHaveBeenCalled();
  });

  it("отметку другого рецензента не снимает рецензент", async () => {
    storageMock.getReviewApproval.mockResolvedValue(approval({ reviewerId: "expert-2" }));
    const res = await request(expertApp()).delete("/api/tests/t1/review/approvals/a1");
    expect(res.status).toBe(403);
  });

  it("отметка другого теста - 404", async () => {
    storageMock.getReviewApproval.mockResolvedValue(approval({ testId: "t2" }));
    const res = await request(expertApp()).delete("/api/tests/t1/review/approvals/a1");
    expect(res.status).toBe(404);
  });

  it("несуществующая отметка - 404", async () => {
    storageMock.getReviewApproval.mockResolvedValue(undefined);
    const res = await request(expertApp()).delete("/api/tests/t1/review/approvals/zzz");
    expect(res.status).toBe(404);
  });
});
