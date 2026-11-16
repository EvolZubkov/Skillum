/**
 * @module tests/it/test-folder-access.it.test
 * @description DAL of test folder access (docs/specs/2026-11-16-folder-access-inheritance-design.md)
 * against a real Postgres (pglite): folder owner on create, the two grant slots
 * per (folder, user), cascade on folder delete and the test/folder lookups the
 * access resolver reads.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { tests, testFolderAccessGrants } from "@shared/schema";
import { createHarness, type Harness } from "./db-harness";

const h = vi.hoisted(() => ({ current: null as Harness | null }));
vi.mock("../../server/db", () => ({
  get db() {
    if (!h.current) throw new Error("harness not initialized");
    return h.current.db;
  },
}));

// eslint-disable-next-line import/first -- must import AFTER vi.mock
import { DatabaseStorage } from "../../server/storage";
// eslint-disable-next-line import/first -- must import AFTER vi.mock
import { planMove, materializeInheritedGrants } from "../../server/services/test-folder-transfer";

let storage: DatabaseStorage;

beforeAll(async () => {
  h.current = await createHarness();
  storage = new DatabaseStorage();
});
afterAll(async () => {
  await h.current!.close();
});
beforeEach(async () => {
  await h.current!.reset();
});

/** Inserts a minimal test row into `folderId` (null = root). */
async function insertTest(id: string, folderId: string | null): Promise<void> {
  await h.current!.db.insert(tests).values({
    id,
    title: "Тест " + id,
    folderId,
    overallPassRuleJson: { type: "percent", value: 70 },
  } as never);
}

describe("test folder owner", () => {
  it("makes the creator the owner of a new folder", async () => {
    const folder = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "u1" });
    expect(folder.ownerId).toBe("u1");
  });

  it("leaves a folder without a creator unowned", async () => {
    const folder = await storage.createTestFolder({ name: "A", parentId: null, createdBy: null });
    expect(folder.ownerId).toBeNull();
  });

  it("changes the owner", async () => {
    const folder = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "u1" });
    await storage.setTestFolderOwner(folder.id, "u2");
    const [row] = (await storage.getTestFolders()).filter((f) => f.id === folder.id);
    expect(row.ownerId).toBe("u2");
  });
});

describe("test folder grants", () => {
  it("replaces the working grant and keeps the review grant in its own slot", async () => {
    const folder = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "o" });
    await storage.upsertTestFolderGrant({ folderId: folder.id, userId: "u", accessLevel: "edit" });
    await storage.upsertTestFolderGrant({ folderId: folder.id, userId: "u", accessLevel: "assign" });
    await storage.upsertTestFolderGrant({ folderId: folder.id, userId: "u", accessLevel: "review" });

    const levels = (await storage.getTestFolderGrantsForFolder(folder.id)).map((g) => g.accessLevel).sort();
    expect(levels).toEqual(["assign", "review"]);
  });

  it("removes one slot only", async () => {
    const folder = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "o" });
    await storage.upsertTestFolderGrant({ folderId: folder.id, userId: "u", accessLevel: "edit" });
    await storage.upsertTestFolderGrant({ folderId: folder.id, userId: "u", accessLevel: "review" });

    expect(await storage.removeTestFolderGrant(folder.id, "u", "work")).toBe(true);
    const levels = (await storage.getTestFolderGrantsForFolder(folder.id)).map((g) => g.accessLevel);
    expect(levels).toEqual(["review"]);
  });

  it("returns every grant of the tree", async () => {
    const a = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "o" });
    const b = await storage.createTestFolder({ name: "B", parentId: a.id, createdBy: "o" });
    await storage.upsertTestFolderGrant({ folderId: a.id, userId: "u", accessLevel: "edit" });
    await storage.upsertTestFolderGrant({ folderId: b.id, userId: "v", accessLevel: "assign" });
    expect((await storage.getTestFolderGrants()).length).toBe(2);
  });

  it("deletes the grants together with the folder", async () => {
    const folder = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "o" });
    await storage.upsertTestFolderGrant({ folderId: folder.id, userId: "u", accessLevel: "edit" });
    await storage.deleteTestFolder(folder.id, null);
    expect(await h.current!.db.select().from(testFolderAccessGrants)).toEqual([]);
  });
});

describe("test and folder lookups", () => {
  it("reads the folder of a test, null for the root and undefined for a missing test", async () => {
    const folder = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "o" });
    await insertTest("t1", folder.id);
    await insertTest("t2", null);
    expect(await storage.getTestFolderIdOfTest("t1")).toBe(folder.id);
    expect(await storage.getTestFolderIdOfTest("t2")).toBeNull();
    expect(await storage.getTestFolderIdOfTest("missing")).toBeUndefined();
  });

  it("maps tests to their folders", async () => {
    const folder = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "o" });
    await insertTest("t1", folder.id);
    await insertTest("t2", null);
    const map = await storage.getFolderIdsOfTests(["t1", "t2"]);
    expect(map.get("t1")).toBe(folder.id);
    expect(map.get("t2")).toBeNull();
    expect((await storage.getFolderIdsOfTests([])).size).toBe(0);
  });

  it("lists the tests of the given folders only", async () => {
    const a = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "o" });
    const b = await storage.createTestFolder({ name: "B", parentId: null, createdBy: "o" });
    await insertTest("t1", a.id);
    await insertTest("t2", b.id);
    await insertTest("t3", null);
    expect(await storage.getTestIdsInFolders([a.id])).toEqual(["t1"]);
    expect(await storage.getTestIdsInFolders([])).toEqual([]);
  });
});

describe("a move keeps the inherited rights", () => {
  /** Levels of the direct grants of a test, as `user:level`, sorted. */
  async function testGrants(testId: string): Promise<string[]> {
    return (await storage.getTestAccessGrants(testId)).map((g) => `${g.userId}:${g.accessLevel}`).sort();
  }

  it("copies the folder grants and the folder owner onto a test moved to the root", async () => {
    const a = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "fo" });
    const b = await storage.createTestFolder({ name: "B", parentId: a.id, createdBy: "fo" });
    await storage.upsertTestFolderGrant({ folderId: a.id, userId: "u", accessLevel: "edit" });
    await storage.upsertTestFolderGrant({ folderId: b.id, userId: "r", accessLevel: "review" });
    await insertTest("t1", b.id);

    const plan = await planMove({ kind: "test", id: "t1" }, null);
    expect(plan.gainedUserIds).toEqual([]);
    await materializeInheritedGrants({ kind: "test", id: "t1" }, plan, "actor");

    expect(await testGrants("t1")).toEqual(["fo:edit", "r:review", "u:edit"]);
  });

  it("is idempotent and never downgrades a direct working grant", async () => {
    const a = await storage.createTestFolder({ name: "A", parentId: null, createdBy: null });
    await storage.upsertTestFolderGrant({ folderId: a.id, userId: "u", accessLevel: "assign" });
    await insertTest("t1", a.id);
    await storage.upsertTestAccessGrant({ testId: "t1", userId: "u", accessLevel: "edit" });

    for (let i = 0; i < 2; i++) {
      const plan = await planMove({ kind: "test", id: "t1" }, null);
      await materializeInheritedGrants({ kind: "test", id: "t1" }, plan, "actor");
    }
    expect(await testGrants("t1")).toEqual(["u:edit"]);
  });

  it("reports the people a destination folder adds", async () => {
    const from = await storage.createTestFolder({ name: "From", parentId: null, createdBy: null });
    const to = await storage.createTestFolder({ name: "To", parentId: null, createdBy: "boss" });
    await storage.upsertTestFolderGrant({ folderId: from.id, userId: "u", accessLevel: "edit" });
    await storage.upsertTestFolderGrant({ folderId: to.id, userId: "u", accessLevel: "edit" });
    await storage.upsertTestFolderGrant({ folderId: to.id, userId: "v", accessLevel: "assign" });
    await insertTest("t1", from.id);

    const plan = await planMove({ kind: "test", id: "t1" }, to.id);
    expect(plan.gainedUserIds.sort()).toEqual(["boss", "v"]);
  });

  it("copies only the ancestors' rights onto a moved folder, not its own", async () => {
    const a = await storage.createTestFolder({ name: "A", parentId: null, createdBy: "fo" });
    const b = await storage.createTestFolder({ name: "B", parentId: a.id, createdBy: "bo" });
    await storage.upsertTestFolderGrant({ folderId: a.id, userId: "u", accessLevel: "assign" });
    await storage.upsertTestFolderGrant({ folderId: b.id, userId: "w", accessLevel: "edit" });

    const plan = await planMove({ kind: "folder", id: b.id }, null);
    await materializeInheritedGrants({ kind: "folder", id: b.id }, plan, "actor");

    const levels = (await storage.getTestFolderGrantsForFolder(b.id)).map((g) => `${g.userId}:${g.accessLevel}`).sort();
    expect(levels).toEqual(["fo:edit", "u:assign", "w:edit"]);
  });
});
