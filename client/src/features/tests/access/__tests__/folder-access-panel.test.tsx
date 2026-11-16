/**
 * @module features/tests/access/__tests__/folder-access-panel.test
 * @description The «Общий доступ» panel of a test folder (folder access
 * inheritance, wireframe `docs/wireframes/approved/test-folder-access.html`):
 * title and owner, «Сменить владельца» only with `tests.owner.change`, two levels
 * only, the empty state, the «Унаследовано» section with its source-folder link,
 * and the explicit «Сохранить» that hits the folder endpoints.
 */
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

const { toastMock, canMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  canMock: vi.fn((_cap: string) => false),
}));
vi.mock("@skillum/ui-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@skillum/ui-kit")>()),
  useToast: () => ({ push: toastMock, dismiss: vi.fn(), clear: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: canMock }) }));

import { FolderAccessPanel } from "../folder-access-panel";

const users = () => [
  { id: "u1", name: "Дмитрий Орлов", email: "do@t.ru", roles: ["author"] },
  { id: "u2", name: "Павел Сорокин", email: "ps@t.ru", roles: ["author"] },
  { id: "u3", name: "Анна Лебедева", email: "al@t.ru", roles: ["manager"] },
];

type Row = { userId: string; accessLevel: "edit" | "assign" };
type Access = {
  ownerId: string | null;
  grants: Row[];
  inherited: (Row & { folderId: string; folderName: string })[];
};

let access: Access;
let fetchMock: ReturnType<typeof vi.fn>;
let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  toastMock.mockClear();
  canMock.mockReset();
  canMock.mockReturnValue(false);
  access = {
    ownerId: "u1",
    grants: [{ userId: "u2", accessLevel: "edit" }],
    inherited: [{ userId: "u3", accessLevel: "assign", folderId: "fTop", folderName: "Охрана труда" }],
  };
  calls = [];
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") calls.push({ url: u, method, body });
    if (u === "/api/test-folders/f1/access/users") return ok(users());
    if (u === "/api/test-folders/f1/access" && method === "GET") return ok(access);
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function renderPanel(props?: { onOpenFolder?: (f: { id: string; name: string }) => void; manageable?: string[] }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <FolderAccessPanel
        folder={{ id: "f1", name: "Инструктажи" }}
        onClose={onClose}
        manageableFolderIds={new Set(props?.manageable ?? [])}
        onOpenFolder={props?.onOpenFolder}
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

async function renderLoaded(props?: Parameters<typeof renderPanel>[0]) {
  const utils = renderPanel(props);
  await waitFor(() => expect(screen.getByText("Павел Сорокин")).toBeInTheDocument());
  return utils;
}

describe("<FolderAccessPanel />", () => {
  it("names the folder, the owner and reads people behind the folder's own gate", async () => {
    await renderLoaded();
    expect(screen.getByText("Общий доступ")).toBeInTheDocument();
    expect(screen.getByText("Папка «Инструктажи»")).toBeInTheDocument();
    expect(screen.getByText("Дмитрий Орлов")).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls).toContain("/api/test-folders/f1/access/users");
    expect(urls).not.toContain("/api/users");
  });

  it("offers «Сменить владельца» only with the owner-change right", async () => {
    await renderLoaded();
    expect(screen.queryByRole("button", { name: "Сменить владельца" })).not.toBeInTheDocument();
  });

  it("offers only «Редактирование» and «Назначение»", async () => {
    await renderLoaded();
    const row = screen.getByText("Павел Сорокин").closest("tr")!;
    fireEvent.click(within(row).getByText("Редактирование").closest("button")!);
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(["Редактирование", "Назначение"]);
  });

  it("shows the empty state and no «Унаследовано» for a folder without any access", async () => {
    access = { ownerId: "u1", grants: [], inherited: [] };
    renderPanel();
    await waitFor(() => expect(screen.getByText("Доступ ещё никому не выдан")).toBeInTheDocument());
    expect(screen.queryByText("Унаследовано")).not.toBeInTheDocument();
  });

  it("lists inherited access and opens a manageable source folder", async () => {
    const onOpenFolder = vi.fn();
    await renderLoaded({ onOpenFolder, manageable: ["fTop"] });
    await waitFor(() => expect(screen.getByText("Унаследовано")).toBeInTheDocument());
    const row = screen.getByRole("button", { name: "Охрана труда" }).closest("tr")!;
    expect(within(row).getByText("Анна Лебедева")).toBeInTheDocument();
    expect(within(row).getByText("Назначение")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Охрана труда" }));
    expect(onOpenFolder).toHaveBeenCalledWith({ id: "fTop", name: "Охрана труда" });
  });

  it("saves a level change and a revocation through the folder endpoints", async () => {
    access = {
      ...access,
      grants: [{ userId: "u2", accessLevel: "edit" }, { userId: "u3", accessLevel: "assign" }],
      inherited: [],
    };
    const { onClose } = await renderLoaded();
    const row = screen.getByText("Павел Сорокин").closest("tr")!;
    fireEvent.click(within(row).getByText("Редактирование").closest("button")!);
    fireEvent.click(screen.getByRole("option", { name: "Назначение" }));
    const other = screen.getByText("Анна Лебедева").closest("tr")!;
    fireEvent.click(within(other).getByRole("button", { name: "Отозвать доступ" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toContainEqual({
      url: "/api/test-folders/f1/access",
      method: "PUT",
      body: { userId: "u2", accessLevel: "assign" },
    });
    expect(calls).toContainEqual({ url: "/api/test-folders/f1/access/u3", method: "DELETE", body: undefined });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Доступ сохранён" }));
  });

  it("changes the owner with the right → PATCH /owner", async () => {
    canMock.mockImplementation((cap: string) => cap === "tests.owner.change");
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Сменить владельца" }));
    fireEvent.click(screen.getByLabelText("Владелец папки").querySelector("button")!);
    fireEvent.click(screen.getByRole("option", { name: "Анна Лебедева" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ url: "/api/test-folders/f1/owner", method: "PATCH", body: { ownerId: "u3" } }),
    );
  });
});
