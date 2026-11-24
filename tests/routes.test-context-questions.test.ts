/**
 * @module tests/routes.test-context-questions
 * @description GET /api/tests/:id/questions (role-model.md 6.5.1): the questions of a
 * test's topics for whoever may EDIT the test. Covers 401, 403 without `tests.edit`,
 * 404 for a missing test, 403 for an `assign` grant, and 200 for the owner and an
 * `edit` grant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

const { storageMock, serviceMock } = vi.hoisted(() => ({
  storageMock: {
    getTest: vi.fn(),
    getUser: vi.fn(),
    getUserRoles: vi.fn(),
    getTestGrantForUser: vi.fn(),
  },
  serviceMock: { testContextQuestions: vi.fn() },
}));

vi.mock("../server/storage", () => ({ storage: storageMock }));
vi.mock("../server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../server/services/test-topic-context", () => serviceMock);

import testContextQuestionsRouter from "../server/routes/test-context-questions";

function makeApp(signedIn = true) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => {
    if (signedIn) req.session.userId = "user-1";
    next();
  });
  app.use("/api/tests", testContextQuestionsRouter);
  return app;
}

const answer = {
  questions: [{ id: "q1", topicId: "t-law", topicName: "Право" }],
  readOnlyTopicIds: ["t-law"],
};

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getUser.mockResolvedValue({ id: "user-1", status: "active" });
  storageMock.getUserRoles.mockResolvedValue(["author"]);
  storageMock.getTest.mockResolvedValue({ id: "test-1", ownerId: "someone-else", folderId: null });
  storageMock.getTestGrantForUser.mockResolvedValue(undefined);
  serviceMock.testContextQuestions.mockResolvedValue(answer);
});

describe("GET /api/tests/:id/questions", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(makeApp(false)).get("/api/tests/test-1/questions");
    expect(res.status).toBe(401);
  });

  it("returns 403 to a role without tests.edit", async () => {
    storageMock.getUserRoles.mockResolvedValue(["learner"]);
    const res = await request(makeApp()).get("/api/tests/test-1/questions");
    expect(res.status).toBe(403);
    expect(serviceMock.testContextQuestions).not.toHaveBeenCalled();
  });

  it("returns 404 when the test does not exist", async () => {
    storageMock.getTest.mockResolvedValue(undefined);
    const res = await request(makeApp()).get("/api/tests/missing/questions");
    expect(res.status).toBe(404);
  });

  it("refuses an author who holds only an assign grant", async () => {
    storageMock.getTestGrantForUser.mockResolvedValue({ accessLevel: "assign" });
    const res = await request(makeApp()).get("/api/tests/test-1/questions");
    expect(res.status).toBe(403);
    expect(serviceMock.testContextQuestions).not.toHaveBeenCalled();
  });

  it("answers the test owner", async () => {
    storageMock.getTest.mockResolvedValue({ id: "test-1", ownerId: "user-1", folderId: null });
    const res = await request(makeApp()).get("/api/tests/test-1/questions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(answer);
    expect(serviceMock.testContextQuestions).toHaveBeenCalledWith(["author"], "user-1", "test-1");
  });

  it("answers the holder of an edit grant without any topic right", async () => {
    storageMock.getTestGrantForUser.mockResolvedValue({ accessLevel: "edit" });
    const res = await request(makeApp()).get("/api/tests/test-1/questions");
    expect(res.status).toBe(200);
    expect(res.body.readOnlyTopicIds).toEqual(["t-law"]);
  });
});
