/**
 * @module features/content/__tests__/content-tree-rights.test
 * @description The bank tree offers only what the server accepts (role-model.md 6.6): a
 * single-object action without the right on its topic is hidden, a group action that applies
 * to nothing selected is disabled, and a row without `rights` grants nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { FULL_TOPIC_RIGHTS, NO_TOPIC_RIGHTS } from "@shared/access";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ can: () => true, hasRole: () => false, user: { id: "u1", name: "Author" } }),
}));
vi.mock("@skillum/ui-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@skillum/ui-kit")>()),
  useToast: () => ({ push: vi.fn(), dismiss: vi.fn(), clear: vi.fn() }),
}));
vi.mock("@/features/content-protection/use-content-guard", () => ({
  useContentGuard: () => ({ guard: vi.fn(), dialogProps: { open: false } }),
}));
vi.mock("@/features/content-protection/content-impact-dialog", () => ({ ContentImpactDialog: () => null }));
vi.mock("@/features/questions/question-editor-drawer", () => ({
  QuestionEditorDrawer: ({ open, topics }: { open: boolean; topics: Array<{ id: string }> }) =>
    (open ? <div data-testid="mock-question-editor" data-topics={topics.map((t) => t.id).join(",")} /> : null),
}));
vi.mock("@/features/topics/topic-drawer", () => ({ TopicDrawer: () => null }));
vi.mock("@/features/content/question-preview", () => ({ QuestionPreview: () => <div data-testid="mock-qpreview" /> }));
vi.mock("@/components/folder-tree-select", () => ({ FolderTreeSelect: () => null }));
vi.mock("@/features/content/bulk-content-ops", () => ({
  GroupMoveModal: () => null,
  GroupAccessModal: () => null,
  FolderDeleteDialog: () => null,
  GroupDeleteFlow: () => null,
}));

import { ContentTree } from "../content-tree";

const topics = [
  { id: "t-own", name: "Своя", folderId: null, ownerId: "u1", visibility: "private", rights: FULL_TOPIC_RIGHTS },
  { id: "t-use", name: "Чужая", folderId: null, ownerId: "u2", visibility: "private", rights: NO_TOPIC_RIGHTS },
  { id: "t-bare", name: "Без прав", folderId: null, ownerId: "u2", visibility: "shared" },
];
const questions = [
  { id: "q-own", topicId: "t-own", type: "single", prompt: "Свой вопрос", difficulty: null, tags: [], createdBy: "u1" },
  { id: "q-use", topicId: "t-use", type: "single", prompt: "Чужой вопрос", difficulty: null, tags: [], createdBy: "u2" },
];

function renderTree() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u === "/api/topics" ? topics : u === "/api/questions" ? questions : [];
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ContentTree />
    </QueryClientProvider>,
  );
}

/** The tree row that shows the given text. */
function rowOf(text: string): HTMLElement {
  return screen.getByText(text).closest(".ct-row") as HTMLElement;
}

async function openTopicMenu(name: string) {
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
  fireEvent.click(within(rowOf(name)).getByLabelText("Действия темы"));
}

beforeEach(() => { window.history.replaceState(null, "", "/"); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<ContentTree /> — topic actions follow the topic's rights", () => {
  it("offers everything on the reader's own topic", async () => {
    renderTree();
    await openTopicMenu("Своя");
    expect(screen.getByTestId("ct-topic-addq-t-own")).toBeInTheDocument();
    expect(screen.getByText("Настройки темы…")).toBeInTheDocument();
    expect(screen.getByText("Доступ…")).toBeInTheDocument();
    expect(screen.getByText("Удалить тему")).toBeInTheDocument();
  });

  it("leaves only the export on a topic without rights", async () => {
    renderTree();
    await openTopicMenu("Чужая");
    expect(screen.getByTestId("ct-topic-export-t-use")).toBeInTheDocument();
    expect(screen.queryByTestId("ct-topic-addq-t-use")).toBeNull();
    expect(screen.queryByText("Настройки темы…")).toBeNull();
    expect(screen.queryByText("Доступ…")).toBeNull();
    expect(screen.queryByText("Переместить в папку…")).toBeNull();
    expect(screen.queryByText("Удалить тему")).toBeNull();
  });

  it("treats a row without rights as a row without rights", async () => {
    renderTree();
    await openTopicMenu("Без прав");
    expect(screen.queryByTestId("ct-topic-addq-t-bare")).toBeNull();
  });
});

describe("<ContentTree /> — question actions follow the topic's rights", () => {
  it("hides editing, duplicating, moving and deleting a question of a topic without rights", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Чужая")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Чужая"));
    fireEvent.click(within(rowOf("Чужой вопрос")).getByLabelText("Действия вопроса"));
    expect(screen.queryByTestId("ct-q-edit-q-use")).toBeNull();
    expect(screen.queryByText("Дублировать")).toBeNull();
    expect(screen.queryByText("Переместить в тему…")).toBeNull();
    // analytics.read is granted by the mocked role, so the menu itself stays.
    expect(screen.getByTestId("ct-q-stats-q-use")).toBeInTheDocument();
  });

  it("keeps them on the reader's own question", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Своя")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Своя"));
    fireEvent.click(within(rowOf("Свой вопрос")).getByLabelText("Действия вопроса"));
    expect(screen.getByTestId("ct-q-edit-q-own")).toBeInTheDocument();
    expect(screen.getByText("Дублировать")).toBeInTheDocument();
  });

  it("disables moving a selection that holds a question of a topic without rights", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Своя")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Своя"));
    fireEvent.click(screen.getByText("Чужая"));
    fireEvent.click(within(rowOf("Свой вопрос")).getByLabelText("Выбрать вопрос"));
    expect(screen.getByTestId("ct-bulk-move-questions")).not.toBeDisabled();
    fireEvent.click(within(rowOf("Чужой вопрос")).getByLabelText("Выбрать вопрос"));
    expect(screen.getByTestId("ct-bulk-move-questions")).toBeDisabled();
  });

  it("offers only manageable topics as the topic of a new question", async () => {
    renderTree();
    await openTopicMenu("Своя");
    fireEvent.click(screen.getByTestId("ct-topic-addq-t-own"));
    expect(screen.getByTestId("mock-question-editor").getAttribute("data-topics")).toBe("t-own");
  });
});

describe("<ContentTree /> — group actions", () => {
  it("disables access, move and delete when no selected topic allows them", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Чужая")).toBeInTheDocument());
    fireEvent.click(within(rowOf("Чужая")).getByLabelText("Выбрать тему для экспорта"));
    expect(screen.getByTestId("ct-group-access")).toBeDisabled();
    expect(screen.getByTestId("ct-group-move")).toBeDisabled();
    expect(screen.getByTestId("ct-group-delete")).toBeDisabled();
    expect(screen.getByTestId("ct-export-topics")).not.toBeDisabled();
  });

  it("keeps them enabled when at least one selected topic allows them", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Своя")).toBeInTheDocument());
    for (const name of ["Своя", "Чужая"]) {
      fireEvent.click(within(rowOf(name)).getByLabelText("Выбрать тему для экспорта"));
    }
    expect(screen.getByTestId("ct-group-access")).not.toBeDisabled();
    expect(screen.getByTestId("ct-group-move")).not.toBeDisabled();
    expect(screen.getByTestId("ct-group-delete")).not.toBeDisabled();
  });
});
