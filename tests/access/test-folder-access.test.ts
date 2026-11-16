/**
 * @module tests/access/test-folder-access.test
 *
 * Server resolver of inherited test-folder rights
 * (docs/specs/2026-11-16-folder-access-inheritance-design.md) and its union with
 * the object-level test checks of `server/services/test-access.ts`. The storage
 * is mocked; the pure rules themselves are covered by
 * shared/access/__tests__/folder-inheritance.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ROLES } from "@shared/access";

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getTestFolders: vi.fn(),
    getTestFolderGrants: vi.fn(),
    getTestFolderIdOfTest: vi.fn(),
    getFolderIdsOfTests: vi.fn(),
    getTestIdsInFolders: vi.fn(),
    getTestGrantForUser: vi.fn(),
    getTestReviewGrant: vi.fn(),
    getTestIdsByOwner: vi.fn(),
    getUserTestGrants: vi.fn(),
    isTestAssignedToUser: vi.fn(),
  },
}));
vi.mock("../../server/storage", () => ({ storage: storageMock }));

import {
  folderRights,
  folderRightsForTest,
  testIdsByFolderRights,
  visibleTestFolders,
} from "../../server/services/test-folder-access";
import {
  canEditTest,
  canAssignTest,
  canReviewTest,
  canDeleteTest,
  readableTestScope,
} from "../../server/services/test-access";

const folder = (id: string, parentId: string | null, ownerId: string | null = null) =>
  ({ id, name: id, parentId, ownerId, createdBy: ownerId, createdAt: new Date() });

/** Tree: root > a > b; c is a separate root folder. */
function setTree(grants: Array<{ folderId: string; userId: string; accessLevel: string }> = []) {
  storageMock.getTestFolders.mockResolvedValue([
    folder("a", null, "fo"),
    folder("b", "a"),
    folder("c", null),
  ]);
  storageMock.getTestFolderGrants.mockResolvedValue(grants);
}

beforeEach(() => {
  vi.resetAllMocks();
  setTree();
  storageMock.getTestGrantForUser.mockResolvedValue(undefined);
  storageMock.getTestReviewGrant.mockResolvedValue(undefined);
  storageMock.getTestIdsByOwner.mockResolvedValue([]);
  storageMock.getUserTestGrants.mockResolvedValue([]);
  storageMock.isTestAssignedToUser.mockResolvedValue(false);
  storageMock.getFolderIdsOfTests.mockResolvedValue(new Map());
  storageMock.getTestIdsInFolders.mockImplementation(async (ids: string[]) =>
    ids.flatMap((id) => (id === "b" ? ["tb"] : id === "a" ? ["ta"] : [])));
});

describe("folderRights", () => {
  it("inherits a grant on an ancestor", async () => {
    setTree([{ folderId: "a", userId: "u", accessLevel: "edit" }]);
    expect((await folderRights("u", "b")).edit).toBe(true);
  });
  it("gives nothing in the root", async () => {
    setTree([{ folderId: "a", userId: "u", accessLevel: "edit" }]);
    expect(await folderRights("u", null)).toEqual({ owner: false, edit: false, assign: false, review: false });
  });
});

describe("folderRightsForTest", () => {
  it("uses the folder given by the caller without asking the storage", async () => {
    await folderRightsForTest("fo", { id: "t", folderId: "b" });
    expect(storageMock.getTestFolderIdOfTest).not.toHaveBeenCalled();
  });
  it("looks the folder up when only the test id is known", async () => {
    storageMock.getTestFolderIdOfTest.mockResolvedValue("b");
    expect((await folderRightsForTest("fo", { id: "t" })).owner).toBe(true);
  });
});

describe("testIdsByFolderRights", () => {
  it("returns the tests of the whole granted subtree", async () => {
    setTree([{ folderId: "a", userId: "u", accessLevel: "edit" }]);
    expect((await testIdsByFolderRights("u", new Set(["edit"]))).sort()).toEqual(["ta", "tb"]);
  });
  it("returns nothing without a folder right", async () => {
    expect(await testIdsByFolderRights("u", new Set(["edit"]))).toEqual([]);
    expect(storageMock.getTestIdsInFolders).not.toHaveBeenCalled();
  });
});

describe("visibleTestFolders", () => {
  it("hides an empty folder without rights and shows the path to an accessible test", async () => {
    storageMock.getFolderIdsOfTests.mockResolvedValue(new Map([["tb", "b"]]));
    const map = await visibleTestFolders("u", new Set(["edit"]), new Set(["tb"]));
    expect([...map.entries()].sort()).toEqual([["a", "transit"], ["b", "transit"]]);
  });
});

describe("union with test-access checks", () => {
  const author = [ROLES.AUTHOR];
  const manager = [ROLES.MANAGER];
  const testInB = { id: "tb", ownerId: "someone", folderId: "b" };

  it("lets an author edit a test through an edit grant on an ancestor folder", async () => {
    setTree([{ folderId: "a", userId: "u", accessLevel: "edit" }]);
    expect(await canEditTest(author, "u", testInB)).toBe(true);
  });
  it("lets a manager assign but not edit through an assign grant on the folder", async () => {
    setTree([{ folderId: "b", userId: "m", accessLevel: "assign" }]);
    expect(await canAssignTest(manager, "m", testInB)).toBe(true);
    expect(await canEditTest(manager, "m", testInB)).toBe(false);
  });
  it("lets an edit grant on the folder open the review of the test", async () => {
    setTree([{ folderId: "a", userId: "r", accessLevel: "edit" }]);
    expect(await canReviewTest([ROLES.LEARNER], "r", testInB)).toBe(true);
  });
  it("does not open the review through an assign grant on the folder", async () => {
    setTree([{ folderId: "a", userId: "r", accessLevel: "assign" }]);
    expect(await canReviewTest([ROLES.LEARNER], "r", testInB)).toBe(false);
  });
  it("lets the folder owner delete a test inside", async () => {
    expect(await canDeleteTest(author, "fo", testInB)).toBe(true);
  });
  it("still honours a direct test grant without any folder right", async () => {
    storageMock.getTestGrantForUser.mockResolvedValue({ accessLevel: "edit" });
    expect(await canEditTest(author, "u", { id: "t0", ownerId: "x", folderId: null })).toBe(true);
  });
  it("denies an author without any right", async () => {
    expect(await canEditTest(author, "u", testInB)).toBe(false);
    expect(await canDeleteTest(author, "u", testInB)).toBe(false);
  });
  it("adds the tests of a granted folder subtree to the readable scope", async () => {
    setTree([{ folderId: "a", userId: "u", accessLevel: "edit" }]);
    const scope = await readableTestScope(author, "u");
    expect([...scope.ids].sort()).toEqual(["ta", "tb"]);
  });
  it("gives a manager the tests of an assign-granted folder, but not an author", async () => {
    setTree([{ folderId: "b", userId: "x", accessLevel: "assign" }]);
    expect([...(await readableTestScope(manager, "x")).ids]).toEqual(["tb"]);
    expect([...(await readableTestScope(author, "x")).ids]).toEqual([]);
  });
});
