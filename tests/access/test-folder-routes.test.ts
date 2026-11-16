/**
 * @module tests/access/test-folder-routes.test
 *
 * HTTP surface of test folder access (docs/specs/2026-11-16-folder-access-inheritance-design.md):
 * the folder list hides what the user cannot reach and marks transit folders,
 * structural operations need `edit` on the folder, grants on a folder are
 * managed by its owner or an administrator, and a move keeps the inherited
 * rights and asks before widening access. The real resolver runs over a mocked
 * storage that models the folder tree.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://fake/test";
});

const { storageMock, state } = vi.hoisted(() => {
  const state = {
    folders: [] as Array<{ id: string; name: string; parentId: string | null; ownerId: string | null }>,
    grants: [] as Array<{ id: string; folderId: string; userId: string; accessLevel: string }>,
    tests: [] as Array<{ id: string; ownerId: string | null; folderId: string | null }>,
    testGrants: [] as Array<{ testId: string; userId: string; accessLevel: string }>,
  };
  const slotOf = (level: string) => (level === "review" ? "review" : "work");
  const storageMock = {
    getUser: vi.fn(),
    getUserRoles: vi.fn(),
    getTestFolders: vi.fn(async () => state.folders.map((f) => ({ ...f, createdBy: f.ownerId }))),
    getTestFolderGrants: vi.fn(async () => state.grants),
    getTestFolderGrantsForFolder: vi.fn(async (id: string) => state.grants.filter((g) => g.folderId === id)),
    upsertTestFolderGrant: vi.fn(async (g: { folderId: string; userId: string; accessLevel: string }) => {
      state.grants = state.grants.filter((x) =>
        !(x.folderId === g.folderId && x.userId === g.userId && slotOf(x.accessLevel) === slotOf(g.accessLevel)));
      const row = { id: `g${state.grants.length + 1}`, ...g };
      state.grants.push(row);
      return row;
    }),
    removeTestFolderGrant: vi.fn(async (folderId: string, userId: string, slot: string) => {
      const before = state.grants.length;
      state.grants = state.grants.filter((x) =>
        !(x.folderId === folderId && x.userId === userId && slotOf(x.accessLevel) === slot));
      return state.grants.length < before;
    }),
    createTestFolder: vi.fn(async (f: { name: string; parentId: string | null; createdBy: string | null }) => {
      const row = { id: "new", name: f.name, parentId: f.parentId, ownerId: f.createdBy };
      state.folders.push(row);
      return row;
    }),
    updateTestFolder: vi.fn(async (id: string, patch: { name?: string; parentId?: string | null }) => {
      const f = state.folders.find((x) => x.id === id);
      if (!f) return undefined;
      if (patch.name !== undefined) f.name = patch.name;
      if (patch.parentId !== undefined) f.parentId = patch.parentId;
      return f;
    }),
    deleteTestFolder: vi.fn(async () => true),
    deleteTestFolderCascade: vi.fn(async () => true),
    moveTestToFolder: vi.fn(async (testId: string, folderId: string | null) => {
      const t = state.tests.find((x) => x.id === testId);
      if (!t) return false;
      t.folderId = folderId;
      return true;
    }),
    getTest: vi.fn(async (id: string) => state.tests.find((t) => t.id === id)),
    getTestFolderIdOfTest: vi.fn(async (id: string) => state.tests.find((t) => t.id === id)?.folderId),
    getFolderIdsOfTests: vi.fn(async (ids: string[]) =>
      new Map(state.tests.filter((t) => ids.includes(t.id)).map((t) => [t.id, t.folderId]))),
    getTestIdsInFolders: vi.fn(async (ids: string[]) =>
      state.tests.filter((t) => t.folderId && ids.includes(t.folderId)).map((t) => t.id)),
    getTestIdsByOwner: vi.fn(async (uid: string) => state.tests.filter((t) => t.ownerId === uid).map((t) => t.id)),
    getUserTestGrants: vi.fn(async (uid: string) => state.testGrants.filter((g) => g.userId === uid)),
    getTestAccessGrants: vi.fn(async (testId: string) => state.testGrants.filter((g) => g.testId === testId)),
    getTestGrantForUser: vi.fn(async (testId: string, uid: string) =>
      state.testGrants.find((g) => g.testId === testId && g.userId === uid && g.accessLevel !== "review")),
    getTestReviewGrant: vi.fn(async (testId: string, uid: string) =>
      state.testGrants.find((g) => g.testId === testId && g.userId === uid && g.accessLevel === "review")),
    upsertTestAccessGrant: vi.fn(async (g: { testId: string; userId: string; accessLevel: string }) => {
      state.testGrants = state.testGrants.filter((x) =>
        !(x.testId === g.testId && x.userId === g.userId && slotOf(x.accessLevel) === slotOf(g.accessLevel)));
      state.testGrants.push(g);
      return g;
    }),
    isTestAssignedToUser: vi.fn(async () => false),
  };
  return { storageMock, state };
});

vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import testFoldersRouter from "../../server/routes/test-folders";

const rolesByUser: Record<string, string[]> = {
  author1: ["author"],
  author2: ["author"],
  admin1: ["administrator"],
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => {
    if (req.headers["x-test-user"]) req.session.userId = req.headers["x-test-user"];
    next();
  });
  app.use("/api/test-folders", testFoldersRouter);
  return app;
}

const app = makeApp();
const as = (who: string) => (req: request.Test) => req.set("x-test-user", who);

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getUser.mockImplementation(async (id: string) =>
    (rolesByUser[id] || id === "u9" ? { id, name: id, status: "active" } : undefined));
  storageMock.getUserRoles.mockImplementation(async (id: string) => rolesByUser[id] ?? []);
  // author2 owns «A» > «B» and the empty «E»; tB lies in «B».
  state.folders = [
    { id: "A", name: "A", parentId: null, ownerId: "author2" },
    { id: "B", name: "B", parentId: "A", ownerId: "author2" },
    { id: "E", name: "E", parentId: null, ownerId: "author2" },
  ];
  state.grants = [];
  state.tests = [{ id: "tB", ownerId: "author2", folderId: "B" }];
  state.testGrants = [];
});

describe("GET /api/test-folders", () => {
  it("shows an author only the transit path to a test granted directly", async () => {
    state.testGrants = [{ testId: "tB", userId: "author1", accessLevel: "edit" }];
    const res = await request(app).get("/api/test-folders").use(as("author1"));
    expect(res.status).toBe(200);
    const rows = res.body.map((f: any) => [f.id, f.visibility, f.canEdit]).sort();
    expect(rows).toEqual([["A", "transit", false], ["B", "transit", false]]);
  });

  it("hides every folder from an author without any right", async () => {
    const res = await request(app).get("/api/test-folders").use(as("author1"));
    expect(res.body).toEqual([]);
  });

  it("shows the granted subtree as direct and editable", async () => {
    state.grants = [{ id: "g1", folderId: "A", userId: "author1", accessLevel: "edit" }];
    const res = await request(app).get("/api/test-folders").use(as("author1"));
    const rows = res.body.map((f: any) => [f.id, f.visibility, f.canEdit, f.canManageAccess]).sort();
    expect(rows).toEqual([["A", "direct", true, false], ["B", "direct", true, false]]);
  });

  it("shows an owner their empty folder", async () => {
    const res = await request(app).get("/api/test-folders").use(as("author2"));
    expect(res.body.map((f: any) => f.id).sort()).toEqual(["A", "B", "E"]);
  });

  it("shows an administrator everything", async () => {
    const res = await request(app).get("/api/test-folders").use(as("admin1"));
    expect(res.body).toHaveLength(3);
    expect(res.body.every((f: any) => f.visibility === "direct" && f.canManageAccess)).toBe(true);
  });
});

describe("structural operations", () => {
  it("refuses to create a folder inside someone else's folder", async () => {
    const res = await request(app).post("/api/test-folders").use(as("author1")).send({ name: "X", parentId: "A" });
    expect(res.status).toBe(403);
    expect(storageMock.createTestFolder).not.toHaveBeenCalled();
  });

  it("creates a folder in the root and inside a folder with an edit grant", async () => {
    state.grants = [{ id: "g1", folderId: "A", userId: "author1", accessLevel: "edit" }];
    expect((await request(app).post("/api/test-folders").use(as("author1")).send({ name: "R" })).status).toBe(201);
    expect((await request(app).post("/api/test-folders").use(as("author1"))
      .send({ name: "X", parentId: "B" })).status).toBe(201);
  });

  it("refuses to rename a folder without edit", async () => {
    const res = await request(app).put("/api/test-folders/A").use(as("author1")).send({ name: "Z" });
    expect(res.status).toBe(403);
  });

  it("refuses to make a folder its own descendant", async () => {
    const res = await request(app).put("/api/test-folders/A").use(as("author2")).send({ parentId: "B" });
    expect(res.status).toBe(400);
  });

  it("lets only the owner delete a folder with its tests", async () => {
    state.grants = [{ id: "g1", folderId: "A", userId: "author1", accessLevel: "edit" }];
    const byEditor = await request(app).delete("/api/test-folders/A").use(as("author1"))
      .send({ mode: "folder-and-tests", confirmName: "A" });
    expect(byEditor.status).toBe(403);
    const byOwner = await request(app).delete("/api/test-folders/A").use(as("author2"))
      .send({ mode: "folder-and-tests", confirmName: "A" });
    expect(byOwner.status).toBe(204);
  });

  it("refuses to move a test the author may not edit", async () => {
    const res = await request(app).patch("/api/test-folders/move/tB").use(as("author1")).send({ folderId: null });
    expect(res.status).toBe(403);
    expect(storageMock.moveTestToFolder).not.toHaveBeenCalled();
  });
});

describe("a move keeps rights and asks before widening access", () => {
  it("copies the rights inherited from the old folder onto a test moved to the root", async () => {
    state.grants = [{ id: "g1", folderId: "A", userId: "author1", accessLevel: "edit" }];
    const res = await request(app).patch("/api/test-folders/move/tB").use(as("author2")).send({ folderId: null });
    expect(res.status).toBe(200);
    expect(state.testGrants).toEqual([expect.objectContaining({ testId: "tB", userId: "author1", accessLevel: "edit" })]);
    expect(state.tests[0].folderId).toBeNull();
  });

  it("answers 409 when the destination adds people, and moves once confirmed", async () => {
    state.grants = [{ id: "g1", folderId: "E", userId: "u9", accessLevel: "assign" }];
    const ask = await request(app).patch("/api/test-folders/move/tB").use(as("author2")).send({ folderId: "E" });
    expect(ask.status).toBe(409);
    expect(ask.body).toEqual({ error: "access_gain", gained: 1 });
    expect(storageMock.moveTestToFolder).not.toHaveBeenCalled();

    const ok = await request(app).patch("/api/test-folders/move/tB").use(as("author2"))
      .send({ folderId: "E", confirmGain: true });
    expect(ok.status).toBe(200);
    expect(state.tests[0].folderId).toBe("E");
  });

  it("asks the same before moving a folder under a wider parent", async () => {
    state.grants = [{ id: "g1", folderId: "E", userId: "u9", accessLevel: "edit" }];
    const ask = await request(app).put("/api/test-folders/B").use(as("author2")).send({ parentId: "E" });
    expect(ask.status).toBe(409);
    const ok = await request(app).put("/api/test-folders/B").use(as("author2")).send({ parentId: "E", confirmGain: true });
    expect(ok.status).toBe(200);
    expect(state.folders.find((f) => f.id === "B")?.parentId).toBe("E");
  });

  it("previews the gain without writing anything", async () => {
    state.grants = [{ id: "g1", folderId: "E", userId: "u9", accessLevel: "assign" }];
    const res = await request(app).post("/api/test-folders/move-preview").use(as("author2"))
      .send({ kind: "test", id: "tB", destFolderId: "E" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gained: 1 });
    expect(storageMock.upsertTestAccessGrant).not.toHaveBeenCalled();
    expect(storageMock.moveTestToFolder).not.toHaveBeenCalled();
  });

  it("refuses a preview of a test the caller may not edit", async () => {
    const res = await request(app).post("/api/test-folders/move-preview").use(as("author1"))
      .send({ kind: "test", id: "tB", destFolderId: null });
    expect(res.status).toBe(403);
  });
});

describe("folder grants", () => {
  it("lets the owner grant and revoke access on a folder", async () => {
    const put = await request(app).put("/api/test-folders/A/access").use(as("author2"))
      .send({ userId: "author1", accessLevel: "edit" });
    expect(put.status).toBe(200);
    const list = await request(app).get("/api/test-folders/B/access").use(as("author2"));
    expect(list.body.inherited).toEqual([expect.objectContaining({ folderId: "A", userId: "author1" })]);
    const del = await request(app).delete("/api/test-folders/A/access/author1/work").use(as("author2"));
    expect(del.status).toBe(204);
    expect(state.grants).toEqual([]);
  });

  it("refuses grants from someone who only edits the folder", async () => {
    state.grants = [{ id: "g1", folderId: "A", userId: "author1", accessLevel: "edit" }];
    const res = await request(app).put("/api/test-folders/A/access").use(as("author1"))
      .send({ userId: "u9", accessLevel: "edit" });
    expect(res.status).toBe(403);
  });

  it("rejects an unknown level and an unknown user", async () => {
    expect((await request(app).put("/api/test-folders/A/access").use(as("author2"))
      .send({ userId: "author1", accessLevel: "owner" })).status).toBe(400);
    expect((await request(app).put("/api/test-folders/A/access").use(as("author2"))
      .send({ userId: "ghost", accessLevel: "edit" })).status).toBe(404);
  });
});
