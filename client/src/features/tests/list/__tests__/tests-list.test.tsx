/**
 * @module features/tests/list/__tests__/tests-list.test
 * @description Component tests for the explorer-tree tests list page.
 *
 * Coverage:
 *   - Tree renders root row + test row from API list (s-default).
 *   - Search switches to flat list with banner (s-search) and "Сбросить" clears it.
 *   - Test more-menu opens with the expected items.
 *   - FR-30: typed-confirm — Delete button stays disabled until the input
 *     matches the test title exactly.
 *   - FAB speed-dial toggles + sub-actions render.
 *   - Empty state shown when there are no tests and no folders.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getPermissions, ROLES, type Capability } from "@shared/access";
import { TestsListPage } from "../tests-list";
import { ToastProvider } from "@skillum/ui-kit";

// The list reads capabilities to gate row actions (PRD-13). Stub the auth
// context so the component renders without an AuthProvider; `authMock.can` is
// mutable so individual tests can simulate a role. Reset to "all true" in
// beforeEach so the rest of the suite keeps every action visible.
const { authMock } = vi.hoisted(() => ({
  authMock: {
    can: (_cap: string): boolean => true,
    roles: [] as string[],
    userId: "current-user",
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    can: (cap: string) => authMock.can(cap),
    hasRole: (role: string) => authMock.roles.includes(role),
    user: { id: authMock.userId },
  }),
  // Ящик редактора читает пользователя НЕОБЯЗАТЕЛЬНО (`useOptionalAuth`): он
  // собирается и без провайдера. Мок обязан знать оба чтения, иначе падает импорт.
  useOptionalAuth: () => ({
    can: (cap: string) => authMock.can(cap),
    hasRole: (role: string) => authMock.roles.includes(role),
    user: { id: authMock.userId },
  }),
}));

/** Build a `can` that mirrors the real role -> permission map for the role set. */
function canForRoles(roles: Parameters<typeof getPermissions>[0]): (cap: string) => boolean {
  const perms = getPermissions(roles);
  return (cap: string) => perms.has(cap as Capability);
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

function buildApiTestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    title: "Основы информационной безопасности",
    description: null,
    status: "draft",
    mode: "standard",
    folderId: null,
    overallPassRuleJson: { type: "percent", value: 70 },
    flowPolicyJson: null,
    feedbackJson: null,
    webhookUrl: null,
    telemetryEnabled: false,
    timeLimitMinutes: null,
    maxAttempts: null,
    showCorrectAnswers: false,
    showDifficultyLevel: true,
    version: 1,
    createdAt: "2026-05-01T10:00:00Z",
    updatedAt: "2026-05-01T10:00:00Z",
    designSettingsJson: {},
    sections: [
      { id: "s-1", testId: "t-1", topicId: "t1", drawCount: 5, required: true, topicName: "Topic", maxQuestions: 10 },
    ],
    ...overrides,
  };
}

function buildApiFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: "f-1",
    name: "Информационная безопасность",
    parentId: null,
    createdAt: "2026-05-01T10:00:00Z",
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom doesn't ship localStorage with persistence across tests; reset.
  window.localStorage.clear();
  // Default: every capability granted (admin-like) so unrelated tests are unaffected.
  authMock.can = () => true;
  authMock.roles = [ROLES.ADMINISTRATOR];
  authMock.userId = "current-user";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockGet(url: string, body: unknown) {
  fetchMock.mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === "string" ? input : input.url;
    if (u.startsWith(url) || u === url) {
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" } as Response;
  });
}

function mockMany(routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === "string" ? input : input.url;
    for (const [path, body] of Object.entries(routes)) {
      if (u === path || u.startsWith(path + "?")) {
        return {
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" } as Response;
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}><ToastProvider>
      <TestsListPage />
    </ToastProvider></QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("<TestsListPage /> — default tree", () => {
  it("renders root + test row from the API list", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow()],
      "/api/test-folders": [],
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId("tests-list-tree")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText("Основы информационной безопасности")).toBeInTheDocument(),
    );
    expect(screen.getByText(/ВСЕ ТЕСТЫ/i)).toBeInTheDocument();
    expect(screen.getByTestId("test-row-t-1")).toBeInTheDocument();
  });

  it("renders folder row when folders exist", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow({ folderId: "f-1" })],
      "/api/test-folders": [buildApiFolder()],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("folder-row-f-1")).toBeInTheDocument());
  });
});

describe("<TestsListPage /> — search", () => {
  it("switches to flat list with banner when query is entered", async () => {
    mockMany({
      "/api/tests": [
        buildApiTestRow({ id: "t-1", title: "Основы информационной безопасности" }),
        buildApiTestRow({ id: "t-2", title: "GDPR для разработчиков" }),
      ],
      "/api/test-folders": [],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("Основы информационной безопасности")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("tests-list-search-input"), { target: { value: "GDPR" } });

    await waitFor(() => expect(screen.getByTestId("tests-list-search")).toBeInTheDocument());
    expect(screen.getByText(/Результаты поиска по/i)).toBeInTheDocument();
    expect(screen.queryByText("Основы информационной безопасности")).toBeNull();
    expect(screen.getByText("GDPR для разработчиков")).toBeInTheDocument();
  });

  it("очистка поля поиска возвращает дерево", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow()],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    // Поиск в стиле «Темы и вопросы» (DS Input) — отдельной кнопки «Сбросить»
    // нет; поиск очищается опустошением поля, после чего возвращается дерево.
    fireEvent.change(screen.getByTestId("tests-list-search-input"), { target: { value: "anything" } });
    fireEvent.change(screen.getByTestId("tests-list-search-input"), { target: { value: "" } });

    await waitFor(() => expect(screen.getByTestId("tests-list-tree")).toBeInTheDocument());
  });
});

describe("<TestsListPage /> — test more-menu", () => {
  it("opens with all required items", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow()],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    fireEvent.click(screen.getByTestId("test-more-t-1"));

    expect(screen.getByTestId("menu-edit-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("menu-save-as-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("menu-toggle-publish-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("menu-move-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("menu-archive-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("menu-delete-t-1")).toBeInTheDocument();
  });

  it("publish menu item label depends on status", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow({ status: "published" })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    fireEvent.click(screen.getByTestId("test-more-t-1"));
    expect(screen.getByText("Снять с публикации")).toBeInTheDocument();
  });
});

describe("<TestsListPage /> — owner column + action gating by role (PRD-13)", () => {
  it("AC-30: shows the owner name in the «Владелец» column", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow({ ownerName: "Марина Иванова" })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));
    expect(screen.getByText("Марина Иванова")).toBeInTheDocument();
  });

  it("an author sees edit, analytics and the more-menu, but not assign", async () => {
    authMock.can = canForRoles([ROLES.AUTHOR]);
    mockMany({ "/api/tests": [buildApiTestRow()], "/api/test-folders": [] });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    expect(screen.getByTestId("test-edit-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("test-analytics-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("test-more-t-1")).toBeInTheDocument();
    expect(screen.queryByTestId("test-assign-t-1")).toBeNull();
  });

  it("a manager sees assign and analytics, but not edit or the more-menu", async () => {
    authMock.can = canForRoles([ROLES.MANAGER]);
    mockMany({ "/api/tests": [buildApiTestRow()], "/api/test-folders": [] });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    expect(screen.getByTestId("test-assign-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("test-analytics-t-1")).toBeInTheDocument();
    expect(screen.queryByTestId("test-edit-t-1")).toBeNull();
    expect(screen.queryByTestId("test-more-t-1")).toBeNull();
  });

  it("a manager without scope on THIS test (canAssign=false) gets no assign button", async () => {
    authMock.can = canForRoles([ROLES.MANAGER]);
    mockMany({
      "/api/tests": [buildApiTestRow({ canAssign: false })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    expect(screen.queryByTestId("test-assign-t-1")).toBeNull();
    // The rest of the row's actions are not affected by the assign scope.
    expect(screen.getByTestId("test-analytics-t-1")).toBeInTheDocument();
  });

  it("canAssign=true keeps the button, and so does an answer that omits the field", async () => {
    authMock.can = canForRoles([ROLES.MANAGER]);
    mockMany({
      "/api/tests": [
        buildApiTestRow({ canAssign: true }),
        buildApiTestRow({ id: "t-2", title: "Второй тест" }),
      ],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    expect(screen.getByTestId("test-assign-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("test-assign-t-2")).toBeInTheDocument();
  });

  it("a test seen through «Назначение» only (canEdit=false) offers no edit, debug or menu", async () => {
    // developer + author + manager: the roles open the actions, the test does not.
    authMock.can = () => true;
    authMock.roles = [ROLES.DEVELOPER, ROLES.AUTHOR, ROLES.MANAGER];
    mockMany({
      "/api/tests": [buildApiTestRow({ canEdit: false, canReview: false, canAssign: true })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    expect(screen.queryByTestId("test-edit-t-1")).toBeNull();
    expect(screen.queryByTestId("test-debug-t-1")).toBeNull();
    expect(screen.queryByTestId("test-more-t-1")).toBeNull();
    expect(screen.getByTestId("test-assign-t-1")).toBeInTheDocument();
    expect(screen.queryByTestId("test-review-t-1")).toBeNull();
  });

  it("a reviewer finds the test and enters the review window from the row (PRD-52)", async () => {
    authMock.can = () => true;
    authMock.roles = [ROLES.DEVELOPER, ROLES.AUTHOR, ROLES.MANAGER];
    mockMany({
      "/api/tests": [buildApiTestRow({ canEdit: false, canReview: true, canAssign: false })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    const review = screen.getByTestId("test-review-t-1");
    expect(review.closest("a")).toHaveAttribute("href", "/review/tests/t-1");
    expect(screen.getByText("Вы рецензент")).toBeInTheDocument();
    // Nothing of the author's own actions, and no analytics of a test they only review.
    expect(screen.queryByTestId("test-edit-t-1")).toBeNull();
    expect(screen.queryByTestId("test-debug-t-1")).toBeNull();
    expect(screen.queryByTestId("test-assign-t-1")).toBeNull();
    expect(screen.queryByTestId("test-analytics-t-1")).toBeNull();
    expect(screen.queryByTestId("test-more-t-1")).toBeNull();
  });

  it("the owner of a test (canEdit=true, canReview=true) gets the author's actions, not «Рецензировать»", async () => {
    authMock.can = () => true;
    authMock.roles = [ROLES.AUTHOR];
    mockMany({
      "/api/tests": [buildApiTestRow({ canEdit: true, canReview: true })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    expect(screen.getByTestId("test-edit-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("test-debug-t-1")).toBeInTheDocument();
    expect(screen.queryByTestId("test-review-t-1")).toBeNull();
    expect(screen.queryByText("Вы рецензент")).toBeNull();
  });

  it("«Общий доступ» shows for the test owner (author, BRC-27)", async () => {
    authMock.can = canForRoles([ROLES.AUTHOR]);
    authMock.roles = [ROLES.AUTHOR];
    authMock.userId = "current-user";
    mockMany({ "/api/tests": [buildApiTestRow({ ownerId: "current-user" })], "/api/test-folders": [] });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    expect(screen.getByTestId("menu-access-t-1")).toBeInTheDocument();
  });

  it("«Общий доступ» is hidden for a non-owner author (object scope, BRC-27)", async () => {
    authMock.can = canForRoles([ROLES.AUTHOR]);
    authMock.roles = [ROLES.AUTHOR];
    authMock.userId = "current-user";
    mockMany({ "/api/tests": [buildApiTestRow({ ownerId: "someone-else" })], "/api/test-folders": [] });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    expect(screen.getByTestId("menu-edit-t-1")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-access-t-1")).toBeNull();
  });

  // role-model 6.1: архив и удаление - область удаления, а не правки.
  it("an `edit` grantee of someone else's test sees neither «Архивировать» nor «Удалить тест»", async () => {
    authMock.can = canForRoles([ROLES.AUTHOR]);
    authMock.roles = [ROLES.AUTHOR];
    authMock.userId = "current-user";
    mockMany({
      "/api/tests": [buildApiTestRow({ ownerId: "someone-else", canEdit: true, canDelete: false })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    expect(screen.getByTestId("menu-edit-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("menu-move-t-1")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-archive-t-1")).toBeNull();
    expect(screen.queryByTestId("menu-delete-t-1")).toBeNull();
  });

  it("the owner of a test (canDelete=true) gets «Архивировать» and «Удалить тест»", async () => {
    authMock.can = canForRoles([ROLES.AUTHOR]);
    authMock.roles = [ROLES.AUTHOR];
    authMock.userId = "current-user";
    mockMany({
      "/api/tests": [buildApiTestRow({ ownerId: "current-user", canEdit: true, canDelete: true })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    expect(screen.getByTestId("menu-archive-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("menu-delete-t-1")).toBeInTheDocument();
  });

  // PRD-52: рецензирование инициирует тот, кто правит тест, а не только владелец.
  it("«Отправить на рецензирование» shows for an author who edits a test they do not own", async () => {
    authMock.can = canForRoles([ROLES.AUTHOR]);
    authMock.roles = [ROLES.AUTHOR];
    authMock.userId = "current-user";
    mockMany({
      "/api/tests": [buildApiTestRow({ ownerId: "someone-else", canEdit: true })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    expect(screen.getByTestId("menu-review-t-1")).toBeInTheDocument();
    // «Общий доступ» — по-прежнему только владельцу.
    expect(screen.queryByTestId("menu-access-t-1")).toBeNull();
  });

  it("«Отправить на рецензирование» is hidden when the test is not editable (canEdit=false)", async () => {
    authMock.can = canForRoles([ROLES.AUTHOR]);
    authMock.roles = [ROLES.AUTHOR];
    authMock.userId = "current-user";
    mockMany({
      "/api/tests": [buildApiTestRow({ ownerId: "someone-else", canEdit: false, canReview: true })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    expect(screen.queryByTestId("menu-review-t-1")).toBeNull();
  });

  it("an author gets «Выполнить отладку» and «Сохранить как…» without the SCORM format", async () => {
    authMock.can = canForRoles([ROLES.AUTHOR]);
    authMock.roles = [ROLES.AUTHOR];
    mockMany({ "/api/tests": [buildApiTestRow()], "/api/test-folders": [] });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    expect(screen.getByTestId("menu-debug-t-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("menu-save-as-t-1"));
    await screen.findByRole("dialog", { name: /Сохранить как/ });
    expect(screen.queryByRole("radio", { name: /SCORM/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /Книга для правки/ })).toBeInTheDocument();
  });

  it("a developer gets «Выполнить отладку» and the SCORM format in «Сохранить как…»", async () => {
    authMock.can = canForRoles([ROLES.DEVELOPER]);
    authMock.roles = [ROLES.DEVELOPER];
    mockMany({ "/api/tests": [buildApiTestRow()], "/api/test-folders": [] });
    renderPage();
    await waitFor(() => screen.getByTestId("test-row-t-1"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    expect(screen.getByTestId("menu-debug-t-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("menu-save-as-t-1"));
    await screen.findByRole("dialog", { name: /Сохранить как/ });
    expect(screen.getByRole("radio", { name: /SCORM/ })).toBeInTheDocument();
  });
});

describe("<TestsListPage /> — move-to-folder (S13.1-G32)", () => {
  it("opens MoveFolderPickModal instead of window.prompt", async () => {
    const promptSpy = vi.spyOn(window, "prompt");
    mockMany({
      "/api/tests": [buildApiTestRow()],
      "/api/test-folders": [buildApiFolder({ id: "f-1", name: "ИБ" })],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    fireEvent.click(screen.getByTestId("test-more-t-1"));
    fireEvent.click(screen.getByTestId("menu-move-t-1"));

    expect(promptSpy).not.toHaveBeenCalled();
    // Папка выбирается DS-деревом (комбобокс), как на «Темах и вопросах».
    // Корень предвыбран (test.folderId === null) → «Переместить» заблокирована (нет изменения).
    expect(screen.getByTestId("move-folder-pick-submit")).toBeDisabled();

    // Раскрыть дерево и выбрать другую папку — кнопка разблокируется.
    // Триггер комбобокса — внутри модалки; дерево раскрывается в портале
    // (document.body), поэтому узел «ИБ» ищем внутри попапа .tb-foldercombo__pop
    // (папка «ИБ» есть и в основном дереве — нужно избежать неоднозначности).
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Корень (без папки)"));
    const pop = document.querySelector(".tb-foldercombo__pop");
    expect(pop).not.toBeNull();
    fireEvent.click(within(pop as HTMLElement).getByText("ИБ"));
    expect(screen.getByTestId("move-folder-pick-submit")).not.toBeDisabled();

    promptSpy.mockRestore();
  });
});

// ─── Folder access inheritance (wireframe approved/test-folder-access.html) ────

/** A JSON answer for the fetch mock. */
function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

/**
 * Fetch mock that tells requests apart by method: the list, the move preview and
 * the move itself, recording every non-GET call.
 */
function mockFolderAccess(opts: {
  folders: Record<string, unknown>[];
  tests?: Record<string, unknown>[];
  preview?: (body: { destFolderId: string | null }) => Response;
  move?: (body: { folderId: string | null; confirmGain?: boolean }) => Response;
}) {
  const calls: { url: string; method: string; body: any }[] = [];
  fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
    const u = typeof input === "string" ? input : input.url;
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") calls.push({ url: u, method, body });
    if (u === "/api/tests") return json(opts.tests ?? [buildApiTestRow()]);
    if (u === "/api/test-folders") return json(opts.folders);
    if (u === "/api/test-folders/move-preview") return opts.preview ? opts.preview(body) : json({ gained: [] });
    if (u.startsWith("/api/test-folders/move/")) return opts.move ? opts.move(body) : json({ success: true });
    return json({}, 404);
  });
  return calls;
}

describe("<TestsListPage /> — folder menu rights", () => {
  it("lists every item of a transit folder's menu, all disabled", async () => {
    mockFolderAccess({
      folders: [buildApiFolder({ visibility: "transit", canEdit: false, canManageAccess: false })],
      tests: [buildApiTestRow({ folderId: "f-1" })],
    });
    renderPage();
    await waitFor(() => screen.getByTestId("folder-row-f-1"));
    fireEvent.click(screen.getByTestId("folder-more-f-1"));
    expect(screen.getByTestId("folder-menu-rename-f-1")).toBeDisabled();
    expect(screen.getByTestId("folder-menu-access-f-1")).toBeDisabled();
    expect(screen.getByTestId("folder-menu-delete-f-1")).toBeDisabled();
    fireEvent.click(screen.getByTestId("folder-menu-access-f-1"));
    expect(screen.queryByText("Папка «Информационная безопасность»")).not.toBeInTheDocument();
  });

  it("disables only «Общий доступ» for an editor who does not own the folder", async () => {
    mockFolderAccess({ folders: [buildApiFolder({ visibility: "direct", canEdit: true, canManageAccess: false })] });
    renderPage();
    await waitFor(() => screen.getByTestId("folder-row-f-1"));
    fireEvent.click(screen.getByTestId("folder-more-f-1"));
    expect(screen.getByTestId("folder-menu-rename-f-1")).not.toBeDisabled();
    expect(screen.getByTestId("folder-menu-delete-f-1")).not.toBeDisabled();
    expect(screen.getByTestId("folder-menu-access-f-1")).toBeDisabled();
  });

  it("opens the folder's «Общий доступ» panel for its owner", async () => {
    mockFolderAccess({ folders: [buildApiFolder({ visibility: "direct", canEdit: true, canManageAccess: true })] });
    renderPage();
    await waitFor(() => screen.getByTestId("folder-row-f-1"));
    fireEvent.click(screen.getByTestId("folder-more-f-1"));
    fireEvent.click(screen.getByTestId("folder-menu-access-f-1"));
    await waitFor(() => expect(screen.getByText("Папка «Информационная безопасность»")).toBeInTheDocument());
  });
});

describe("<TestsListPage /> — move widens access", () => {
  const gained = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, name: `Человек ${i + 1}`, accessLevel: "assign" }));

  /** Opens «Переместить в папку» of t-1 and picks «Охрана труда». */
  async function pickDestination() {
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    fireEvent.click(screen.getByTestId("menu-move-t-1"));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Корень (без папки)"));
    fireEvent.click(within(document.querySelector(".tb-foldercombo__pop") as HTMLElement).getByText("Охрана труда"));
  }

  const folders = [buildApiFolder({ id: "f-2", name: "Охрана труда", canEdit: true, canManageAccess: true })];

  it("names the people the destination adds and confirms the move", async () => {
    const calls = mockFolderAccess({
      folders,
      preview: () => json({
        gained: [
          { userId: "a", name: "Павел Сорокин", accessLevel: "edit" },
          { userId: "b", name: "Елена Кравцова", accessLevel: "assign" },
          { userId: "c", name: "Анна Лебедева", accessLevel: "assign" },
        ],
      }),
    });
    await pickDestination();
    await waitFor(() => expect(screen.getByTestId("move-gain-banner")).toBeInTheDocument());
    expect(screen.getByText("В новой папке доступ к тесту получат ещё 3 человека")).toBeInTheDocument();
    expect(screen.getByText("Павел Сорокин (редактирование), Елена Кравцова (назначение), Анна Лебедева (назначение)"))
      .toBeInTheDocument();
    expect(calls).toContainEqual(expect.objectContaining({
      url: "/api/test-folders/move-preview",
      body: { kind: "test", id: "t-1", destFolderId: "f-2" },
    }));
    fireEvent.click(screen.getByTestId("move-folder-pick-submit"));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({
      url: "/api/test-folders/move/t-1",
      body: { folderId: "f-2", confirmGain: true },
    })));
    await waitFor(() => expect(screen.queryByTestId("move-folder-pick-submit")).not.toBeInTheDocument());
  });

  it("names ten people and counts the rest; one person reads «получит ещё 1 человек»", async () => {
    mockFolderAccess({ folders, preview: () => json({ gained: gained(12) }) });
    await pickDestination();
    await waitFor(() => expect(screen.getByTestId("move-gain-banner")).toBeInTheDocument());
    expect(screen.getByText(/Человек 10 \(назначение\), и ещё 2$/)).toBeInTheDocument();
    expect(screen.queryByText(/Человек 11/)).not.toBeInTheDocument();
  });

  it("reads the singular for one person", async () => {
    mockFolderAccess({ folders, preview: () => json({ gained: gained(1) }) });
    await pickDestination();
    await waitFor(() =>
      expect(screen.getByText("В новой папке доступ к тесту получит ещё 1 человек")).toBeInTheDocument());
  });

  it("moves without confirmation and without a banner when nobody is added", async () => {
    const calls = mockFolderAccess({ folders });
    await pickDestination();
    fireEvent.click(screen.getByTestId("move-folder-pick-submit"));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({
      url: "/api/test-folders/move/t-1",
      body: { folderId: "f-2" },
    })));
    expect(screen.queryByTestId("move-gain-banner")).not.toBeInTheDocument();
  });

  it("keeps the dialog open on 409 and confirms on the next click", async () => {
    const calls = mockFolderAccess({
      folders,
      preview: () => json({ error: "boom" }, 500),
      move: (body) => body.confirmGain
        ? json({ success: true })
        : json({ error: "access_gain", gained: [{ userId: "a", name: "Павел Сорокин", accessLevel: "edit" }] }, 409),
    });
    await pickDestination();
    fireEvent.click(screen.getByTestId("move-folder-pick-submit"));
    await waitFor(() => expect(screen.getByTestId("move-gain-banner")).toBeInTheDocument());
    expect(screen.getByTestId("move-folder-pick-submit")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("move-folder-pick-submit"));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({
      url: "/api/test-folders/move/t-1",
      body: { folderId: "f-2", confirmGain: true },
    })));
  });

  it("shows a folder the reader may not edit, but not selectable", async () => {
    mockFolderAccess({
      folders: [...folders, buildApiFolder({ id: "f-3", name: "Чужая", canEdit: false, visibility: "transit" })],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));
    fireEvent.click(screen.getByTestId("test-more-t-1"));
    fireEvent.click(screen.getByTestId("menu-move-t-1"));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Корень (без папки)"));
    const pop = document.querySelector(".tb-foldercombo__pop") as HTMLElement;
    expect(within(pop).getByText("Чужая").closest("[role='treeitem']")?.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("<TestsListPage /> — delete confirm (FR-30)", () => {
  it("blocks Delete until input matches the title exactly", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow()],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    fireEvent.click(screen.getByTestId("test-more-t-1"));
    fireEvent.click(screen.getByTestId("menu-delete-t-1"));

    const confirmBtn = screen.getByTestId("delete-test-confirm") as HTMLButtonElement;
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId("delete-test-input"), { target: { value: "wrong" } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId("delete-test-input"), {
      target: { value: "Основы информационной безопасности" },
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  // PRD-15 FR-07a, approved wireframe test-delete-lms-impact.
  it("names what goes with the test and offers archiving as the alternative", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow()],
      "/api/test-folders": [],
      "/api/tests/t-1/delete-impact": { webAttempts: 12, lmsAttempts: 125, importBatches: 2, packages: 3 },
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    fireEvent.click(screen.getByTestId("test-more-t-1"));
    fireEvent.click(screen.getByTestId("menu-delete-t-1"));

    const banner = await screen.findByTestId("delete-test-impact");
    expect(banner).toHaveTextContent("Будут удалены 137 прохождений");
    expect(banner).toHaveTextContent("125 — из LMS, в том числе 2 загруженные выгрузки");
    expect(screen.getByText(/будет удалён безвозвратно/)).toBeInTheDocument();

    // Archiving needs no typed title: it is the reversible alternative.
    fireEvent.click(screen.getByTestId("delete-test-archive"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tests/t-1/status",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "archived" }) }),
      ),
    );
    expect(screen.queryByTestId("delete-test-confirm")).toBeNull();
  });

  it("has no banner without attempts and no archive button without the right to archive", async () => {
    authMock.can = (cap) => cap !== "tests.publish";
    mockMany({
      "/api/tests": [buildApiTestRow()],
      "/api/test-folders": [],
      "/api/tests/t-1/delete-impact": { webAttempts: 0, lmsAttempts: 0, importBatches: 0, packages: 0 },
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    fireEvent.click(screen.getByTestId("test-more-t-1"));
    fireEvent.click(screen.getByTestId("menu-delete-t-1"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/tests/t-1/delete-impact", expect.anything()),
    );
    expect(screen.queryByTestId("delete-test-impact")).toBeNull();
    expect(screen.queryByTestId("delete-test-archive")).toBeNull();
  });
});

describe("<TestsListPage /> — FAB", () => {
  it("toggles speed-dial and shows new-test / new-folder actions", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow()],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    expect(screen.queryByTestId("fab-new-test")).toBeNull();
    expect(screen.queryByTestId("fab-new-folder")).toBeNull();

    fireEvent.click(screen.getByTestId("fab-toggle"));
    expect(screen.getByTestId("fab-new-test")).toBeInTheDocument();
    expect(screen.getByTestId("fab-new-folder")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("fab-toggle"));
    expect(screen.queryByTestId("fab-new-test")).toBeNull();
  });
});

describe("<TestsListPage /> — empty state", () => {
  it("shows empty pane with two CTAs when no data", async () => {
    mockMany({
      "/api/tests": [],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("tests-list-empty")).toBeInTheDocument());
    expect(screen.getByTestId("tests-list-empty-new-folder")).toBeInTheDocument();
    expect(screen.getByTestId("tests-list-empty-new-test")).toBeInTheDocument();
  });
});

// ─── PRD-22 (plan Э6): pages needing a variant mapping ────────────────────────

describe("<TestsListPage /> — unmapped-page mark", () => {
  it("метит тест с непривязанными страницами и открывает полотно сценария", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow({ unmappedPageCount: 3 })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    // A bare pictogram — the count is in the tooltip, not on screen.
    const mark = screen.getByTestId("test-unmapped-t-1");
    expect(mark).toHaveTextContent("");
    expect(mark).toHaveAttribute("title", expect.stringContaining("Страниц с недоступным вариантом: 3"));

    // Ящик открывается на «Составе и сценарии» — там живёт полотно, где привязка и
    // делается; клик по самой строке привёл бы автора на «Основное».
    fireEvent.click(mark);
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Состав и сценарий/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  });

  it("shows no mark when nothing needs mapping", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow({ unmappedPageCount: 0 })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    expect(screen.queryByTestId("test-unmapped-t-1")).toBeNull();
  });
});

// ─── PRD-52 FR-32: открытые комментарии рецензентов ──────────────────────────

describe("<TestsListPage /> — счётчик комментариев", () => {
  it("показывает число открытых комментариев", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow({ openReviewComments: 3 })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    const mark = screen.getByTestId("open-comments");
    expect(mark).toHaveTextContent("3");
    expect(mark).toHaveAttribute("title", "Открытых комментариев: 3");
  });

  it("у теста без открытых комментариев строка не меняется", async () => {
    mockMany({
      "/api/tests": [buildApiTestRow({ openReviewComments: 0 })],
      "/api/test-folders": [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Основы информационной безопасности"));

    expect(screen.queryByTestId("open-comments")).toBeNull();
  });
});

// ─── PRD-52 FR-27: ссылка на конкретную ветку ────────────────────────────────

describe("<TestsListPage /> — ссылка ?review=<id>", () => {
  it("открывает ящик теста сразу на вкладке «Рецензирование»", async () => {
    window.history.replaceState(null, "", "/author/tests?test=t-1&review=c1");
    mockMany({ "/api/tests": [buildApiTestRow()], "/api/test-folders": [] });
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Рецензирование/ })).toHaveAttribute("aria-selected", "true"),
    );
    // Параметры сняты с адреса: обновление страницы не должно снова открывать ящик.
    expect(window.location.search).toBe("");
  });

});
