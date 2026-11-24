/**
 * @module features/tests/access/__tests__/test-access-panel.test
 * @description Coverage suite for the per-test access panel (PRD-13, WF-2). Drives
 * the owner section (display / «не назначен» / change-owner Select), the grants
 * table (empty state, per-row level change, revoke), the add-grant flow (Combobox +
 * level + «Добавить»), and the explicit «Сохранить» that batches owner change,
 * grant upserts and revocations — asserting the exact endpoints hit, the success
 * toast + onClose, and the error toast on a failed request.
 */
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@skillum/ui-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@skillum/ui-kit")>()),
  useToast: () => ({ push: toastMock, dismiss: vi.fn(), clear: vi.fn() }),
}));

import { TestAccessPanel } from "../test-access-panel";

// ─── Fixtures ────────────────────────────────────────────────────────────────────

const users = () => [
  { id: "u1", name: "Иван Петров", email: "ivan@t.ru", roles: ["author"] },
  { id: "u2", name: "Мария Сидорова", email: "maria@t.ru", roles: ["manager"] },
  { id: "u3", name: "Пётр Смирнов", email: "petr@t.ru", roles: ["author"] },
];

type Access = {
  testId: string;
  ownerId: string | null;
  grants: { userId: string; accessLevel: "edit" | "assign" }[];
  inherited?: { userId: string; accessLevel: "edit" | "assign"; folderId: string; folderName: string }[];
};

let access: Access;
let reviewers: { userId: string; name: string | null; email: string | null; external: boolean }[];
let ownerPatchOk: boolean;
let fetchMock: ReturnType<typeof vi.fn>;
let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  toastMock.mockClear();
  access = { testId: "t1", ownerId: "u1", grants: [{ userId: "u2", accessLevel: "edit" }] };
  reviewers = [];
  ownerPatchOk = true;
  calls = [];

  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  const fail = (body: unknown) => ({ ok: false, status: 400, json: async () => body, text: async () => JSON.stringify(body) });

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") calls.push({ url: u, method, body });
    if (u === "/api/tests/t1/access/users") return ok(users());
    if (u === "/api/tests/t1/review/reviewers" && method === "GET") return ok(reviewers);
    if (u === "/api/tests/t1/access" && method === "GET") return ok(access);
    if (u === "/api/tests/t1/owner") return ownerPatchOk ? ok({}) : fail({ error: "Владельца сменить нельзя" });
    if (u === "/api/tests/t1/access" && method === "POST") return ok({});
    if (u.startsWith("/api/tests/t1/access/")) return ok({}); // DELETE revoke
    return ok([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function renderPanel(props?: {
  test?: { id: string; title: string } | null;
  onClose?: () => void;
  manageableFolderIds?: ReadonlySet<string>;
  onOpenFolder?: (folder: { id: string; name: string }) => void;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } },
  });
  const onClose = props?.onClose ?? vi.fn();
  const test = props && "test" in props ? props.test ?? null : { id: "t1", title: "Тест по финансам" };
  const utils = render(
    <QueryClientProvider client={client}>
      <TestAccessPanel
        test={test}
        onClose={onClose}
        manageableFolderIds={props?.manageableFolderIds}
        onOpenFolder={props?.onOpenFolder}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onClose };
}

/** Wait until the loaded access draft has seeded the panel (owner name visible). */
async function renderLoaded(props?: Parameters<typeof renderPanel>[0]) {
  const utils = renderPanel(props);
  await waitFor(() => expect(screen.getByText("Мария Сидорова")).toBeInTheDocument());
  return utils;
}

describe("<TestAccessPanel />", () => {
  it("renders nothing when no test is selected (drawer closed)", () => {
    renderPanel({ test: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads people behind the panel's own gate, not the user registry", async () => {
    // An author holds `tests.access.grant` but not `users.read`.
    await renderLoaded();
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls).toContain("/api/tests/t1/access/users");
    expect(urls).not.toContain("/api/users");
  });

  it("renders the owner and the existing grant row", async () => {
    await renderLoaded();
    // Owner (u1) shown via avatar + name; grantee (u2) in the table.
    expect(screen.getByText("Иван Петров")).toBeInTheDocument();
    expect(screen.getByText("Мария Сидорова")).toBeInTheDocument();
    // A real grant → no empty state.
    expect(screen.queryByText("Доступ ещё никому не выдан")).not.toBeInTheDocument();
    expect(screen.getByText("Тест по финансам")).toBeInTheDocument();
  });

  it("shows «Владелец не назначен» when the test has no owner", async () => {
    access = { testId: "t1", ownerId: null, grants: [] };
    renderPanel();
    await waitFor(() => expect(screen.getByText("Владелец не назначен")).toBeInTheDocument());
    // No grants → empty state.
    expect(screen.getByText("Доступ ещё никому не выдан")).toBeInTheDocument();
  });

  it("reveals the owner Select on «Сменить владельца»", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Сменить владельца" }));
    // The Select trigger now carries the current owner as its value.
    expect(screen.getByLabelText("Владелец теста")).toBeInTheDocument();
  });

  it("adds a grant through the combobox + level, showing the new row", async () => {
    await renderLoaded();
    // Only u3 is addable (u1 is owner, u2 already granted).
    const combo = screen.getByRole("combobox");
    fireEvent.focus(combo);
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Пётр Смирнов"));
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    // The new grantee now appears in the table alongside the existing one.
    await waitFor(() => expect(screen.getByText("Пётр Смирнов")).toBeInTheDocument());
    expect(screen.getByText("Мария Сидорова")).toBeInTheDocument();
  });

  // Role-model 6.0: a learner is never offered, neither as a grantee nor as an owner.
  describe("only administrative roles are offered", () => {
    beforeEach(() => {
      const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
        String(url) === "/api/tests/t1/access/users"
          ? { ok: true, status: 200, json: async () => [...users(), { id: "u4", name: "Ученик Учеников", email: "l@t.ru", roles: ["learner"] }] }
          : base(url, init));
    });

    it("leaves the learner out of the add-user list", async () => {
      await renderLoaded();
      fireEvent.focus(screen.getByRole("combobox"));
      const listbox = screen.getByRole("listbox");
      expect(within(listbox).getByText("Пётр Смирнов")).toBeInTheDocument();
      expect(within(listbox).queryByText("Ученик Учеников")).not.toBeInTheDocument();
    });

    it("searches the owner field and leaves the learner out", async () => {
      await renderLoaded();
      fireEvent.click(screen.getByRole("button", { name: "Сменить владельца" }));
      const field = screen.getByRole("combobox", { name: "Владелец теста" });
      fireEvent.focus(field);
      expect(within(screen.getByRole("listbox")).queryByText("Ученик Учеников")).not.toBeInTheDocument();
      fireEvent.change(field, { target: { value: "maria" } });
      const found = within(screen.getByRole("listbox")).getAllByRole("option");
      expect(found).toHaveLength(1);
      expect(found[0]).toHaveTextContent("Мария Сидорова");
    });
  });

  it("revokes a grant, collapsing the table to its empty state", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Отозвать доступ" }));
    await waitFor(() => expect(screen.getByText("Доступ ещё никому не выдан")).toBeInTheDocument());
    expect(screen.queryByText("Мария Сидорова")).not.toBeInTheDocument();
  });

  it("changes a grant level through the per-row Select", async () => {
    await renderLoaded();
    const row = screen.getByText("Мария Сидорова").closest("tr")!;
    // The row Select trigger shows the current level; open it and pick «Назначение».
    fireEvent.click(within(row).getByText("Редактирование").closest("button")!);
    fireEvent.click(screen.getByRole("option", { name: "Назначение" }));
    await waitFor(() => expect(within(row).getByText("Назначение")).toBeInTheDocument());
  });

  it("saves an owner change → PATCH /owner, success toast and onClose", async () => {
    const { onClose } = await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Сменить владельца" }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Владелец теста" }));
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Пётр Смирнов"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/tests/t1/owner" && c.method === "PATCH")).toBe(true));
    const owner = calls.find((c) => c.url === "/api/tests/t1/owner")!;
    expect((owner.body as { ownerId: string }).ownerId).toBe("u3");
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Доступ сохранён" })));
    expect(onClose).toHaveBeenCalled();
  });

  it("saves an added grant → POST /access with the chosen level", async () => {
    await renderLoaded();
    const combo = screen.getByRole("combobox");
    fireEvent.focus(combo);
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Пётр Смирнов"));
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(screen.getByText("Пётр Смирнов")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => {
      const post = calls.find((c) => c.url === "/api/tests/t1/access" && c.method === "POST");
      expect(post).toBeTruthy();
      expect((post!.body as { userId: string }).userId).toBe("u3");
    });
  });

  it("saves a revocation → DELETE /access/:userId", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Отозвать доступ" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === "/api/tests/t1/access/u2" && c.method === "DELETE")).toBe(true),
    );
  });

  describe("«Рецензирование» (PRD-52, a slot of its own)", () => {
    it("says so when nobody is invited", async () => {
      await renderLoaded();
      await waitFor(() => expect(screen.getByText("Рецензенты не приглашены")).toBeInTheDocument());
      expect(screen.getByText("Рецензирование")).toBeInTheDocument();
    });

    it("lists reviewers with how they were invited, next to the working grants", async () => {
      reviewers = [
        { userId: "u3", name: "Пётр Смирнов", email: "petr@t.ru", external: false },
        { userId: "ext", name: "Внешний Эксперт", email: "ext@o.ru", external: true },
      ];
      await renderLoaded();
      await waitFor(() => expect(screen.getByText("Внешний Эксперт")).toBeInTheDocument());
      expect(within(screen.getByText("Пётр Смирнов").closest("tr")!).getByText("по аккаунту")).toBeInTheDocument();
      expect(within(screen.getByText("Внешний Эксперт").closest("tr")!).getByText("по ссылке")).toBeInTheDocument();
      // The working grant is still there and is not mixed with the reviewers.
      expect(screen.getByText("Мария Сидорова")).toBeInTheDocument();
    });

    it("a revocation waits for «Сохранить» and touches only the review slot", async () => {
      reviewers = [{ userId: "u3", name: "Пётр Смирнов", email: "petr@t.ru", external: false }];
      await renderLoaded();
      await waitFor(() => expect(screen.getByText("Пётр Смирнов")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Отозвать рецензирование" }));
      expect(screen.queryByText("Пётр Смирнов")).not.toBeInTheDocument();
      expect(calls).toHaveLength(0); // nothing sent before the explicit save
      fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
      await waitFor(() =>
        expect(calls.some((c) => c.url === "/api/tests/t1/review/reviewers/u3" && c.method === "DELETE")).toBe(true),
      );
      // The person's working access is not revoked by it.
      expect(calls.some((c) => c.url.startsWith("/api/tests/t1/access/"))).toBe(false);
    });
  });

  describe("«Унаследовано» (folder access inheritance)", () => {
    const inherited = [
      { userId: "u3", accessLevel: "edit" as const, folderId: "fA", folderName: "Охрана труда" },
      { userId: "u1", accessLevel: "assign" as const, folderId: "fB", folderName: "Чужая папка" },
    ];

    it("is absent for an older answer without the field", async () => {
      await renderLoaded();
      expect(screen.queryByText("Унаследовано")).not.toBeInTheDocument();
    });

    it("is absent when nothing is inherited", async () => {
      access = { ...access, inherited: [] };
      await renderLoaded();
      expect(screen.queryByText("Унаследовано")).not.toBeInTheDocument();
    });

    it("lists who reaches the test through its folders, with level and folder", async () => {
      access = { ...access, inherited };
      await renderLoaded();
      await waitFor(() => expect(screen.getByText("Унаследовано")).toBeInTheDocument());
      const row = screen.getByText("Охрана труда").closest("tr")!;
      expect(within(row).getByText("Пётр Смирнов")).toBeInTheDocument();
      expect(within(row).getByText("Редактирование")).toBeInTheDocument();
    });

    it("opens a manageable source folder and shows any other as text", async () => {
      access = { ...access, inherited };
      const onOpenFolder = vi.fn();
      await renderLoaded({ manageableFolderIds: new Set(["fA"]), onOpenFolder });
      await waitFor(() => expect(screen.getByText("Унаследовано")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Охрана труда" }));
      expect(onOpenFolder).toHaveBeenCalledWith({ id: "fA", name: "Охрана труда" });
      expect(screen.queryByRole("button", { name: "Чужая папка" })).not.toBeInTheDocument();
      expect(screen.getByText("Чужая папка")).toBeInTheDocument();
    });
  });

  it("surfaces a failed owner change via a destructive toast (no close)", async () => {
    ownerPatchOk = false;
    const { onClose } = await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Сменить владельца" }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Владелец теста" }));
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Пётр Смирнов"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ tone: "error", description: "Владельца сменить нельзя" }),
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
