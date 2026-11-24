/**
 * @module server/services/__tests__/test-topic-context.test
 * @description Topics a test references and their questions read in the context of that
 * test (role-model.md 6.5.1): the union of sections and scenario banks, every question of
 * each topic with its name, and the topics the reader may not manage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { storageMock, canManage } = vi.hoisted(() => ({
  storageMock: {
    getTestSections: vi.fn(),
    getTestScenarios: vi.fn(),
    getTopic: vi.fn(),
    getQuestionsByTopic: vi.fn(),
  },
  canManage: vi.fn(),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../topic-access", () => ({ canManageTopicContent: canManage }));

// eslint-disable-next-line import/first -- must import AFTER vi.mock
import { testReferencedTopicIds, testContextQuestions } from "../test-topic-context";

const topic = (id: string) => ({ id, name: `Тема ${id}`, ownerId: "owner", visibility: "private" });

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getTestSections.mockResolvedValue([{ topicId: "t-law" }, { topicId: "t-sec" }]);
  storageMock.getTestScenarios.mockResolvedValue([{ topicId: "t-sim" }, { topicId: "t-law" }]);
  storageMock.getTopic.mockImplementation(async (id: string) => (id === "t-gone" ? undefined : topic(id)));
  storageMock.getQuestionsByTopic.mockImplementation(async (id: string) => [{ id: `q-${id}`, topicId: id }]);
  canManage.mockImplementation(async (_roles: unknown, _user: unknown, t: { id: string }) => t.id === "t-sec");
});

describe("testReferencedTopicIds", () => {
  it("unites section topics and scenario banks without duplicates", async () => {
    expect([...(await testReferencedTopicIds("test-1"))]).toEqual(["t-law", "t-sec", "t-sim"]);
    expect(storageMock.getTestSections).toHaveBeenCalledWith("test-1");
    expect(storageMock.getTestScenarios).toHaveBeenCalledWith("test-1");
  });
});

describe("testContextQuestions", () => {
  it("returns every question of every referenced topic with its topic name", async () => {
    const out = await testContextQuestions(["author"], "user-1", "test-1");
    expect(out.questions).toEqual([
      { id: "q-t-law", topicId: "t-law", topicName: "Тема t-law" },
      { id: "q-t-sec", topicId: "t-sec", topicName: "Тема t-sec" },
      { id: "q-t-sim", topicId: "t-sim", topicName: "Тема t-sim" },
    ]);
  });

  it("names the topics the reader may not manage as read-only", async () => {
    const out = await testContextQuestions(["author"], "user-1", "test-1");
    expect(out.readOnlyTopicIds).toEqual(["t-law", "t-sim"]);
    expect(canManage).toHaveBeenCalledWith(["author"], "user-1", topic("t-law"));
  });

  it("skips a referenced topic that no longer exists", async () => {
    storageMock.getTestSections.mockResolvedValue([{ topicId: "t-gone" }]);
    storageMock.getTestScenarios.mockResolvedValue([]);
    const out = await testContextQuestions(["author"], "user-1", "test-1");
    expect(out).toEqual({ questions: [], readOnlyTopicIds: [] });
    expect(storageMock.getQuestionsByTopic).not.toHaveBeenCalled();
  });
});
