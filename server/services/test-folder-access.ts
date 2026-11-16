/**
 * @module server/services/test-folder-access
 *
 * Server side of folder access inheritance for TESTS
 * (docs/specs/2026-11-16-folder-access-inheritance-design.md): loads the test
 * folder tree and its grants and applies the pure rules of `@shared/access`.
 * The rights returned here are only ever ADDED to the object-level checks of
 * `test-access.ts` (union, no denials). Role gating stays with the caller:
 * this module answers "what does the folder chain give", not "may this role act".
 *
 * The tree and the grants are read whole on every call. Test folders number in
 * the tens or hundreds, and a list resolves its rights in one pass.
 */

import {
  ancestorChain,
  folderRightsOf,
  visibleFolderMap,
  NO_FOLDER_RIGHTS,
  type FolderAccessLevel,
  type FolderNode,
  type FolderRights,
  type FolderVisibility,
} from "@shared/access";
import { storage } from "../storage";

/** The test folder tree, keyed by id, reduced to what inheritance needs. */
export async function loadTestFolderNodes(): Promise<Map<string, FolderNode>> {
  const folders = await storage.getTestFolders();
  return new Map(folders.map((f) => [f.id, { id: f.id, parentId: f.parentId ?? null, ownerId: f.ownerId ?? null }]));
}

/**
 * Rights of `userId` on the content of the folder `folderId`.
 *
 * @param userId - Whose rights.
 * @param folderId - Folder, `null` for the root (the root gives no inherited rights).
 * @returns Rights inherited along the folder chain.
 */
export async function folderRights(userId: string, folderId: string | null): Promise<FolderRights> {
  if (!folderId) return { ...NO_FOLDER_RIGHTS };
  const [nodes, grants] = await Promise.all([loadTestFolderNodes(), storage.getTestFolderGrants()]);
  return folderRightsOf(ancestorChain(folderId, nodes), grants, userId);
}

/**
 * Rights inherited by a test from its folder chain. Looks the folder up when the
 * caller passes only the test id (`folderId` undefined).
 *
 * @param userId - Whose rights.
 * @param test - The test; `folderId: null` means the root.
 * @returns Rights inherited along the folder chain of the test.
 */
export async function folderRightsForTest(
  userId: string,
  test: { id: string; folderId?: string | null },
): Promise<FolderRights> {
  const folderId = test.folderId !== undefined ? test.folderId : await storage.getTestFolderIdOfTest(test.id);
  return folderRights(userId, folderId ?? null);
}

/**
 * Rights of `userId` on every test folder at once (one read of the tree and the
 * grants), for lists that mark each folder.
 *
 * @param userId - Whose rights.
 * @returns Rights keyed by folder id.
 */
export async function folderRightsMap(userId: string): Promise<Map<string, FolderRights>> {
  const [nodes, grants] = await Promise.all([loadTestFolderNodes(), storage.getTestFolderGrants()]);
  const result = new Map<string, FolderRights>();
  for (const id of nodes.keys()) result.set(id, folderRightsOf(ancestorChain(id, nodes), grants, userId));
  return result;
}

/**
 * Is `candidateParentId` the folder itself or one of its descendants? Moving a
 * folder there would make `parentId` a cycle.
 *
 * @param folderId - Folder being moved.
 * @param candidateParentId - Proposed new parent.
 * @returns True when the move would create a cycle.
 */
export async function isInSubtree(folderId: string, candidateParentId: string): Promise<boolean> {
  const nodes = await loadTestFolderNodes();
  return ancestorChain(candidateParentId, nodes).some((n) => n.id === folderId);
}

/** Does `rights` hold at least one of `levels`? */
function holdsAny(rights: FolderRights, levels: ReadonlySet<FolderAccessLevel>): boolean {
  for (const level of levels) if (rights[level]) return true;
  return false;
}

/**
 * Ids of tests lying in folders where the user holds one of `levels` by
 * inheritance (list and analytics scope).
 *
 * @param userId - Whose scope.
 * @param levels - Levels that count for the caller's role.
 * @returns Test ids, unordered.
 */
export async function testIdsByFolderRights(
  userId: string,
  levels: ReadonlySet<FolderAccessLevel>,
): Promise<string[]> {
  const [nodes, grants] = await Promise.all([loadTestFolderNodes(), storage.getTestFolderGrants()]);
  const folderIds: string[] = [];
  for (const id of nodes.keys()) {
    if (holdsAny(folderRightsOf(ancestorChain(id, nodes), grants, userId), levels)) folderIds.push(id);
  }
  if (folderIds.length === 0) return [];
  return storage.getTestIdsInFolders(folderIds);
}

/**
 * The user's test folder tree with `direct` / `transit` marks. Folders absent
 * from the map are hidden from the user, empty ones included.
 *
 * @param userId - Whose tree.
 * @param levels - Grant levels that make a folder `direct` for the caller's role.
 * @param accessibleTestIds - Tests the user may read (from `readableTestScope`).
 * @returns Visible folder ids with their mark.
 */
export async function visibleTestFolders(
  userId: string,
  levels: ReadonlySet<FolderAccessLevel>,
  accessibleTestIds: ReadonlySet<string>,
): Promise<Map<string, FolderVisibility>> {
  const [nodes, grants, folderOfTest] = await Promise.all([
    loadTestFolderNodes(),
    storage.getTestFolderGrants(),
    storage.getFolderIdsOfTests([...accessibleTestIds]),
  ]);
  const itemFolderIds = new Set<string>();
  for (const folderId of folderOfTest.values()) if (folderId) itemFolderIds.add(folderId);
  return visibleFolderMap(nodes, userId, grants, levels, itemFolderIds);
}
