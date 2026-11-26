/**
 * @module tests/review-invite
 *
 * PRD-52 FR-06/FR-07: приглашение рецензентов. Проверяется, что человек получает
 * ГРАНТ на рецензирование и персональную ссылку с назначением «рецензирование», а
 * не назначение на прохождение, — и что уже имеющийся edit-доступ при этом не
 * понижается: грант `review` ложится вторым, в свой слот, и именно он делает
 * соавтора рецензентом в окне рецензирования. Владелец теста рецензентом своего
 * теста не становится: согласование он принимает, а не даёт.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => { process.env.DATABASE_URL = "postgresql://fake/test"; });

const { storageMock, emailMock } = vi.hoisted(() => ({
  storageMock: {
    getTest: vi.fn(),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    setUserRoles: vi.fn(),
    getTestGrantForUser: vi.fn(),
    getTestReviewGrant: vi.fn(),
    upsertTestAccessGrant: vi.fn(),
    createAssignmentAccessToken: vi.fn(),
    createAssignment: vi.fn(),
  },
  emailMock: { sendReviewInviteEmail: vi.fn() },
}));

vi.mock("../server/email", () => emailMock);
vi.mock("../server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { inviteReviewers } from "../server/services/review-invite";

const EXPIRES = new Date("2026-10-01T00:00:00.000Z");

function run(rows: { email: string; name?: string }[], over: Record<string, unknown> = {}) {
  return inviteReviewers({
    testId: "t1",
    rows,
    actorId: "author-1",
    linkExpiresAt: EXPIRES,
    storage: storageMock as never,
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getTest.mockResolvedValue({ id: "t1", title: "Сертификационный тест" });
  storageMock.getUserByEmail.mockResolvedValue(undefined);
  storageMock.createUser.mockImplementation(async (data: Record<string, unknown>) => ({
    id: "new-user", email: data.email, name: data.name ?? null,
  }));
  storageMock.getTestGrantForUser.mockResolvedValue(undefined);
  storageMock.getTestReviewGrant.mockResolvedValue(undefined);
  storageMock.upsertTestAccessGrant.mockResolvedValue({ id: "g1" });
  storageMock.createAssignmentAccessToken.mockResolvedValue({ id: "tok1" });
  emailMock.sendReviewInviteEmail.mockResolvedValue(true);
});

describe("inviteReviewers", () => {
  it("выдаёт грант review и ссылку с назначением «рецензирование»", async () => {
    const report = await run([{ email: "expert@x.test", name: "Ирина" }]);

    expect(storageMock.upsertTestAccessGrant).toHaveBeenCalledWith(
      expect.objectContaining({ testId: "t1", accessLevel: "review", grantedBy: "author-1" }),
    );
    expect(storageMock.createAssignmentAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "review", assignmentId: null, testId: "t1" }),
    );
    expect(report.invited).toBe(1);
    expect(report.results[0].magicLink).toContain("/access/");
  });

  it("назначения на прохождение не создаёт: рецензент не участник", async () => {
    await run([{ email: "expert@x.test" }]);
    expect(storageMock.createAssignment).not.toHaveBeenCalled();
  });

  it("новому человеку заводит ВНЕШНЮЮ учётку без пароля и роль learner", async () => {
    await run([{ email: "new@x.test", name: "Новый" }]);
    expect(storageMock.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@x.test", isExternal: true, passwordHash: null, status: "pending" }),
    );
    expect(storageMock.setUserRoles).toHaveBeenCalledWith("new-user", ["learner"], "author-1");
  });

  it("существующую учётку не переводит во внешние — обратного пути нет", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: "u9", email: "staff@x.test", name: "Сотрудник" });
    await run([{ email: "staff@x.test" }]);
    expect(storageMock.createUser).not.toHaveBeenCalled();
    expect(storageMock.updateUser).not.toHaveBeenCalled();
  });

  it("имя из списка заполняет пробел, но не переписывает существующее", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: "u9", email: "staff@x.test", name: null });
    storageMock.updateUser.mockResolvedValue({ id: "u9", email: "staff@x.test", name: "Из списка" });
    await run([{ email: "staff@x.test", name: "Из списка" }]);
    expect(storageMock.updateUser).toHaveBeenCalledWith("u9", { name: "Из списка" });
  });

  it("повторное приглашение не плодит грантов", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: "u9", email: "expert@x.test", name: "Ирина" });
    storageMock.getTestReviewGrant.mockResolvedValue({ accessLevel: "review" });
    const report = await run([{ email: "expert@x.test" }]);
    expect(storageMock.upsertTestAccessGrant).not.toHaveBeenCalled();
    expect(report.alreadyHadAccess).toBe(1);
    expect(report.invited).toBe(0);
  });

  // Без гранта `review` соавтор в окне рецензирования видел вид автора и не мог согласовать.
  it("соавтору с edit-доступом выдаёт рецензирование ВТОРЫМ грантом, правку не трогает", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: "author-2", email: "co@x.test", name: "Соавтор" });
    storageMock.getTestGrantForUser.mockResolvedValue({ accessLevel: "edit" });
    const report = await run([{ email: "co@x.test" }]);
    expect(storageMock.upsertTestAccessGrant).toHaveBeenCalledTimes(1);
    expect(storageMock.upsertTestAccessGrant).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "author-2", accessLevel: "review" }),
    );
    expect(report.invited).toBe(1);
    expect(report.alreadyHadAccess).toBe(0);
  });

  it("владельца теста рецензентом не делает: ни гранта, ни ссылки, ни письма, а строка в отчёте", async () => {
    storageMock.getTest.mockResolvedValue({ id: "t1", title: "Сертификационный тест", ownerId: "owner-1" });
    storageMock.getUserByEmail.mockResolvedValue({ id: "owner-1", email: "owner@x.test", name: "Владелец" });
    const report = await run([{ email: "owner@x.test" }]);
    expect(storageMock.upsertTestAccessGrant).not.toHaveBeenCalled();
    expect(storageMock.createAssignmentAccessToken).not.toHaveBeenCalled();
    expect(emailMock.sendReviewInviteEmail).not.toHaveBeenCalled();
    expect(report.invited).toBe(0);
    expect(report.failed).toEqual([
      { email: "owner@x.test", reason: "Владелец теста не может быть его рецензентом" },
    ]);
  });

  // PRD-52 14.8: назначать и рецензировать один человек может одновременно.
  it("методисту с правом назначать выдаёт рецензирование ВТОРЫМ грантом", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: "mgr-1", email: "mgr@x.test", name: "Методист" });
    storageMock.getTestGrantForUser.mockResolvedValue({ accessLevel: "assign" });
    const report = await run([{ email: "mgr@x.test" }]);
    expect(storageMock.upsertTestAccessGrant).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "mgr-1", accessLevel: "review" }),
    );
    expect(report.failed).toEqual([]);
    expect(report.invited).toBe(1);
  });

  it("ссылка всё равно выпускается: доступ уже есть, а войти по письму человек хочет", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: "u9", email: "expert@x.test", name: "Ирина" });
    storageMock.getTestReviewGrant.mockResolvedValue({ accessLevel: "review" });
    await run([{ email: "expert@x.test" }]);
    expect(storageMock.createAssignmentAccessToken).toHaveBeenCalledTimes(1);
  });

  it("без письма ссылка выпускается молча — пользователь платформы войдёт сам", async () => {
    await run([{ email: "staff@x.test" }], { sendEmail: false });
    expect(emailMock.sendReviewInviteEmail).not.toHaveBeenCalled();
    expect(storageMock.createAssignmentAccessToken).toHaveBeenCalledTimes(1);
  });

  it("сбой на одном адресе не отменяет остальных", async () => {
    storageMock.createUser
      .mockRejectedValueOnce(new Error("duplicate"))
      .mockImplementation(async (data: Record<string, unknown>) => ({ id: "u2", email: data.email, name: null }));

    const report = await run([{ email: "bad@x.test" }, { email: "good@x.test" }]);

    expect(report.failed).toEqual([{ email: "bad@x.test", reason: "duplicate" }]);
    expect(report.invited).toBe(1);
  });

  it("несуществующий тест — отказ до любых записей", async () => {
    storageMock.getTest.mockResolvedValue(undefined);
    await expect(run([{ email: "expert@x.test" }])).rejects.toThrow("Test not found");
    expect(storageMock.upsertTestAccessGrant).not.toHaveBeenCalled();
  });
});
