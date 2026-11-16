/**
 * @module server/routes/test-folders
 *
 * Test folder tree API (`/api/test-folders`) with folder access inheritance
 * (docs/specs/2026-11-16-folder-access-inheritance-design.md). The capability
 * `folders.manage` opens the API; the folder decides:
 *
 * - the list holds only folders the user reaches: `direct` (owned or granted
 *   along the chain) or `transit` (on the path to an accessible test); empty
 *   folders without rights are hidden;
 * - creating inside, renaming, moving and "folder only" deletion need `edit` on
 *   the folder; deletion together with the tests needs the folder owner;
 * - grants on a folder are managed by its owner or an administrator;
 * - a move of a test or a folder keeps the rights inherited from the old chain
 *   (copied as direct grants) and answers `409 access_gain` when the
 *   destination would add people, until the client repeats it with
 *   `confirmGain: true`. `POST /move-preview` reports that count in advance.
 *
 * Administrators and the superadmin bypass the folder scope, as for tests.
 */
import { Router, type Request, type Response } from "express";
import { hasAuthoringRole, ROLES, type FolderAccessLevel, type Role } from "@shared/access";
import { logger } from "../logger";
import { storage } from "../storage";
import { requirePermission } from "../middleware/auth";
import { isAdminOrSuper, readableTestScope, canEditTest } from "../services/test-access";
import {
  folderRights,
  folderRightsMap,
  isInSubtree,
  visibleTestFolders,
} from "../services/test-folder-access";
import { planMove, materializeInheritedGrants, type MoveSubject } from "../services/test-folder-transfer";

const router = Router();

const LEVELS: readonly FolderAccessLevel[] = ["edit", "assign", "review"];

/** Caller identity resolved by `requirePermission`. */
function who(req: Request): { roles: readonly Role[]; userId: string } {
  return { roles: req.effectiveRoles ?? [], userId: req.currentUser?.id ?? "" };
}

/** May the caller change the structure of (or inside) this folder? */
async function canEditFolder(roles: readonly Role[], userId: string, folderId: string): Promise<boolean> {
  if (isAdminOrSuper(roles)) return true;
  if (!hasAuthoringRole(roles)) return false;
  return (await folderRights(userId, folderId)).edit;
}

/** May the caller manage the grants of this folder (and delete it with its tests)? */
async function canManageFolder(roles: readonly Role[], userId: string, folderId: string): Promise<boolean> {
  if (isAdminOrSuper(roles)) return true;
  if (!hasAuthoringRole(roles)) return false;
  return (await folderRights(userId, folderId)).owner;
}

/** Sends 403 and returns false when `allowed` is false. */
function allowOr403(res: Response, allowed: boolean): boolean {
  if (!allowed) res.status(403).json({ error: "forbidden" });
  return allowed;
}

/**
 * Moves `subject` keeping its inherited rights. Answers 409 itself and returns
 * false when the destination adds people and the caller has not confirmed.
 */
async function moveKeepingRights(
  req: Request,
  res: Response,
  subject: MoveSubject,
  destFolderId: string | null,
  apply: () => Promise<void>,
): Promise<boolean> {
  const plan = await planMove(subject, destFolderId);
  if (plan.gainedUserIds.length > 0 && req.body?.confirmGain !== true) {
    res.status(409).json({ error: "access_gain", gained: plan.gainedUserIds.length });
    return false;
  }
  await materializeInheritedGrants(subject, plan, req.currentUser?.id ?? null);
  await apply();
  return true;
}

/** The folder row, or 404 sent and `undefined` returned. */
async function folderOr404(res: Response, id: string) {
  const folder = (await storage.getTestFolders()).find((f) => f.id === id);
  if (!folder) res.status(404).json({ error: "Folder not found" });
  return folder;
}

// GET /api/test-folders — the caller's tree with visibility marks.
router.get("/", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const folders = await storage.getTestFolders();
    if (isAdminOrSuper(roles)) {
      return res.json(folders.map((f) => ({ ...f, visibility: "direct", canEdit: true, canManageAccess: true })));
    }
    const scope = await readableTestScope(roles, userId);
    const levels = new Set<FolderAccessLevel>(roles.includes(ROLES.MANAGER) ? ["edit", "assign"] : ["edit"]);
    const [visibility, rights] = await Promise.all([
      visibleTestFolders(userId, levels, scope.ids),
      folderRightsMap(userId),
    ]);
    const authoring = hasAuthoringRole(roles);
    res.json(folders
      .filter((f) => visibility.has(f.id))
      .map((f) => ({
        ...f,
        visibility: visibility.get(f.id),
        canEdit: authoring && Boolean(rights.get(f.id)?.edit),
        canManageAccess: authoring && Boolean(rights.get(f.id)?.owner),
      })));
  } catch (error) {
    logger.error("Get test folders error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to get test folders" });
  }
});

// POST /api/test-folders — inside a folder needs `edit` on it; the root needs only the capability.
router.post("/", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const { name, parentId } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: "Name required" });
    }
    if (parentId && !allowOr403(res, await canEditFolder(roles, userId, parentId))) return;
    const folder = await storage.createTestFolder({
      name: name.trim(),
      parentId: parentId || null,
      createdBy: req.currentUser?.id ?? null,
    });
    res.status(201).json(folder);
  } catch (error) {
    logger.error("Create test folder error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to create test folder" });
  }
});

// PUT /api/test-folders/:id — rename and/or move; `edit` on the folder and on the new parent.
router.put("/:id", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const { name, parentId } = req.body as { name?: string; parentId?: string | null };
    const folder = await folderOr404(res, req.params.id);
    if (!folder) return;
    if (!allowOr403(res, await canEditFolder(roles, userId, folder.id))) return;
    const moving = parentId !== undefined && (parentId ?? null) !== (folder.parentId ?? null);
    if (moving && parentId) {
      if (await isInSubtree(folder.id, parentId)) {
        return res.status(400).json({ error: "cycle", field: "parentId" });
      }
      if (!allowOr403(res, await canEditFolder(roles, userId, parentId))) return;
    }
    let updated: Awaited<ReturnType<typeof storage.updateTestFolder>>;
    const write = async () => { updated = await storage.updateTestFolder(folder.id, { name, parentId }); };
    if (moving) {
      if (!(await moveKeepingRights(req, res, { kind: "folder", id: folder.id }, parentId ?? null, write))) return;
    } else {
      await write();
    }
    if (!updated) {
      return res.status(404).json({ error: "Folder not found" });
    }
    res.json(updated);
  } catch (error) {
    logger.error("Update test folder error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to update test folder" });
  }
});

/**
 * DELETE /api/test-folders/:id
 *
 * Два варианта удаления по эскизу prd7-tests-list.html
 * (s-folder-delete-a / s-folder-delete-b):
 *
 *   { mode: "folder-only", moveTestsTo: string | null }
 *     — удалить только папку; все тесты и вложенные папки переносятся в
 *       указанное место (`null` означает корень). Нужно право `edit` на папке.
 *
 *   { mode: "folder-and-tests", confirmName: string }
 *     — удалить папку вместе со всеми тестами в ней (включая транзитивно
 *       через вложенные папки). Требует точное совпадение `confirmName` с
 *       именем папки (FR-30 для папок) и владельца папки.
 *
 * Backward compatibility: пустое body — старое поведение «folder-only» с
 * переносом в корень (для legacy-клиентов, оставшихся на старом UI).
 */
router.delete("/:id", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const folder = await folderOr404(res, req.params.id);
    if (!folder) return;

    const body = (req.body ?? {}) as {
      mode?: string;
      moveTestsTo?: string | null;
      confirmName?: string;
    };

    if (body.mode === "folder-and-tests") {
      if (!allowOr403(res, await canManageFolder(roles, userId, folder.id))) return;
      if (!body.confirmName || body.confirmName !== folder.name) {
        return res.status(400).json({ error: "name_mismatch", field: "confirmName" });
      }
      const success = await storage.deleteTestFolderCascade(req.params.id);
      if (!success) return res.status(404).json({ error: "Folder not found" });
      return res.status(204).end();
    }

    // Default "folder-only": move tests/sub-folders to the requested destination.
    if (!allowOr403(res, await canEditFolder(roles, userId, folder.id))) return;
    const moveTo = body.moveTestsTo === undefined ? null : body.moveTestsTo;
    if (moveTo && !allowOr403(res, await canEditFolder(roles, userId, moveTo))) return;
    // Everything directly inside moves to `moveTo`: keep what it inherited through
    // this folder. The deletion itself is the confirmation, so a gain is not blocked.
    const childFolders = (await storage.getTestFolders()).filter((f) => f.parentId === folder.id);
    const subjects: MoveSubject[] = [
      ...(await storage.getTestIdsInFolders([folder.id])).map((id) => ({ kind: "test" as const, id })),
      ...childFolders.map((f) => ({ kind: "folder" as const, id: f.id })),
    ];
    for (const subject of subjects) {
      await materializeInheritedGrants(subject, await planMove(subject, moveTo), userId || null);
    }
    const success = await storage.deleteTestFolder(req.params.id, moveTo);
    if (!success) return res.status(404).json({ error: "Folder not found" });
    res.status(204).end();
  } catch (error) {
    logger.error("Delete test folder error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to delete test folder" });
  }
});

// PATCH /api/test-folders/move/:testId — move a test; edit on the test and on the destination.
router.patch("/move/:testId", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const { folderId } = req.body as { folderId?: string | null };
    const test = await storage.getTest(req.params.testId);
    if (!test) {
      return res.status(404).json({ error: "Test not found" });
    }
    if (!allowOr403(res, await canEditTest(roles, userId, test))) return;
    if (folderId && !allowOr403(res, await canEditFolder(roles, userId, folderId))) return;
    let success = true;
    const write = async () => { success = await storage.moveTestToFolder(test.id, folderId ?? null); };
    if ((test.folderId ?? null) === (folderId ?? null)) {
      await write(); // same folder: nothing inherited changes
    } else if (!(await moveKeepingRights(req, res, { kind: "test", id: test.id }, folderId ?? null, write))) {
      return;
    }
    if (!success) {
      return res.status(404).json({ error: "Test not found" });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error("Move test error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to move test" });
  }
});

// POST /api/test-folders/move-preview — { kind, id, destFolderId }: how many people a move adds.
router.post("/move-preview", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const { kind, id, destFolderId } = req.body as { kind?: string; id?: string; destFolderId?: string | null };
    if ((kind !== "test" && kind !== "folder") || !id) {
      return res.status(400).json({ error: "invalid_subject" });
    }
    if (kind === "test") {
      const test = await storage.getTest(id);
      if (!test) return res.status(404).json({ error: "Test not found" });
      if (!allowOr403(res, await canEditTest(roles, userId, test))) return;
    } else {
      if (!(await folderOr404(res, id))) return;
      if (!allowOr403(res, await canEditFolder(roles, userId, id))) return;
    }
    const plan = await planMove({ kind, id }, destFolderId ?? null);
    res.json({ gained: plan.gainedUserIds.length });
  } catch (error) {
    logger.error("Move preview error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to preview move" });
  }
});

// GET /api/test-folders/:id/access — owner, own grants and grants inherited from ancestors.
router.get("/:id/access", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const folder = await folderOr404(res, req.params.id);
    if (!folder) return;
    if (!allowOr403(res, await canManageFolder(roles, userId, folder.id))) return;
    const all = await storage.getTestFolders();
    const byId = new Map(all.map((f) => [f.id, f]));
    const ancestorIds = new Set<string>();
    for (let p = folder.parentId; p && !ancestorIds.has(p); p = byId.get(p)?.parentId ?? null) ancestorIds.add(p);
    const grants = await storage.getTestFolderGrants();
    res.json({
      ownerId: folder.ownerId,
      grants: grants.filter((g) => g.folderId === folder.id),
      inherited: grants.filter((g) => ancestorIds.has(g.folderId)),
    });
  } catch (error) {
    logger.error("Get test folder access error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to get folder access" });
  }
});

// PUT /api/test-folders/:id/access — { userId, accessLevel }: write one grant slot.
router.put("/:id/access", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const { userId: granteeId, accessLevel } = req.body as { userId?: string; accessLevel?: string };
    const folder = await folderOr404(res, req.params.id);
    if (!folder) return;
    if (!allowOr403(res, await canManageFolder(roles, userId, folder.id))) return;
    if (!granteeId || !LEVELS.includes(accessLevel as FolderAccessLevel)) {
      return res.status(400).json({ error: "invalid_grant" });
    }
    if (!(await storage.getUser(granteeId))) {
      return res.status(404).json({ error: "User not found" });
    }
    const grant = await storage.upsertTestFolderGrant({
      folderId: folder.id,
      userId: granteeId,
      accessLevel: accessLevel as FolderAccessLevel,
      grantedBy: userId || null,
    });
    res.json(grant);
  } catch (error) {
    logger.error("Grant test folder access error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to grant folder access" });
  }
});

// DELETE /api/test-folders/:id/access/:userId/:slot — slot is `work` or `review`.
router.delete("/:id/access/:userId/:slot", requirePermission("folders.manage"), async (req, res) => {
  try {
    const { roles, userId } = who(req);
    const { slot } = req.params;
    if (slot !== "work" && slot !== "review") {
      return res.status(400).json({ error: "invalid_slot" });
    }
    const folder = await folderOr404(res, req.params.id);
    if (!folder) return;
    if (!allowOr403(res, await canManageFolder(roles, userId, folder.id))) return;
    const removed = await storage.removeTestFolderGrant(folder.id, req.params.userId, slot);
    if (!removed) return res.status(404).json({ error: "Grant not found" });
    res.status(204).end();
  } catch (error) {
    logger.error("Revoke test folder access error: " + (error as Error).message);
    res.status(500).json({ error: "Failed to revoke folder access" });
  }
});

export default router;
