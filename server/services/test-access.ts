/**
 * @module server/services/test-access
 *
 * Object-level access resolution for tests (PRD-13, role-model.md section 6).
 * The role -> permission map decides whether an action is allowed in principle;
 * these helpers decide whether it applies to a SPECIFIC test by owner and grant.
 * Administrators and the superadmin bypass scope; the authoring roles (author and
 * developer, see `AUTHORING_ROLES`) are scoped to owned and edit-granted tests;
 * managers to assign-granted tests.
 *
 * Added in Phase 2 alongside the permission core; route handlers start calling it
 * in Phase 3 (PRD-13 implementation plan).
 *
 * Rights inherited from the test's folder chain
 * (docs/specs/2026-11-16-folder-access-inheritance-design.md) are a UNION with
 * the owner and grant branches: each check falls back to them last, so they only
 * ever widen access. The role still opens the action, exactly as for test grants.
 */

import { ROLES, hasAuthoringRole, type FolderAccessLevel, type Role } from "@shared/access";
import { storage } from "../storage";
import type { Test } from "@shared/schema";
import { folderRightsForTest, testIdsByFolderRights } from "./test-folder-access";

/**
 * Minimal test shape needed for resolution. `folderId` is optional: callers that
 * hold the row pass it, the others make the resolver look it up.
 */
type TestRef = Pick<Test, "id" | "ownerId"> & { folderId?: string | null };

function hasRole(roles: readonly Role[], role: Role): boolean {
  return roles.includes(role);
}

/** Administrator or superadmin: full access to all tests, bypassing scope. */
export function isAdminOrSuper(roles: readonly Role[]): boolean {
  return hasRole(roles, ROLES.SUPERADMIN) || hasRole(roles, ROLES.ADMINISTRATOR);
}

/**
 * Can read the test: author edit-scope, manager assign-scope, or the test is
 * assigned to the user (role-model.md 6.4 `assignedToUser` branch — the
 * learner runtime reads design/screen data of assigned tests; PRD-15 FR-09).
 */
export async function canReadTest(
  roles: readonly Role[],
  userId: string,
  test: TestRef,
): Promise<boolean> {
  if (isAdminOrSuper(roles)) return true;
  if (hasAuthoringRole(roles) && (await canEditTest(roles, userId, test))) return true;
  if (hasRole(roles, ROLES.MANAGER) && (await canAssignTest(roles, userId, test))) return true;
  if (await storage.isTestAssignedToUser(test.id, userId)) return true;
  return false;
}

/** Can edit/publish/export the test: owner or edit-grant for authoring roles. */
export async function canEditTest(
  roles: readonly Role[],
  userId: string,
  test: TestRef,
): Promise<boolean> {
  if (isAdminOrSuper(roles)) return true;
  if (hasAuthoringRole(roles)) {
    if (test.ownerId === userId) return true;
    const grant = await storage.getTestGrantForUser(test.id, userId);
    if (grant?.accessLevel === "edit") return true;
    return (await folderRightsForTest(userId, test)).edit;
  }
  return false;
}

/** Can delete/archive the test: the test owner or the owner of a folder above it (plus admin/super). */
export async function canDeleteTest(
  roles: readonly Role[],
  userId: string,
  test: TestRef,
): Promise<boolean> {
  if (isAdminOrSuper(roles)) return true;
  if (!hasAuthoringRole(roles)) return false;
  if (test.ownerId === userId) return true;
  return (await folderRightsForTest(userId, test)).owner;
}

/** Publishing, SCORM export and the debug run all follow the edit scope. */
export const canPublishTest = canEditTest;
export const canExportScorm = canEditTest;
export const canDebugTest = canEditTest;

/**
 * Can review the test (PRD-52): anyone who may already edit it, or the holder of
 * a `review` grant on this specific test.
 *
 * Deliberately role-agnostic. An external expert arrives by a magic link and holds
 * `learner` only, so gating this by a capability would lock out exactly the audience
 * the reviewer screen exists for — the grant is what carries the permission. The
 * `assign` grant does NOT qualify: delivering a test to learners says nothing about
 * being invited to review its content.
 */
export async function canReviewTest(
  roles: readonly Role[],
  userId: string,
  test: TestRef,
): Promise<boolean> {
  if (await canEditTest(roles, userId, test)) return true;
  // The review grant has its own slot, so a manager's `assign` beside it does not hide it.
  if (await storage.getTestReviewGrant(test.id, userId)) return true;
  // A folder grants no review of its own (review is granted on a test only); `edit` on a
  // folder of the chain, or owning one, still opens the review of every test below it.
  return (await folderRightsForTest(userId, test)).review;
}

/**
 * Can assign the test (plus admin/super). The manager role opens the action;
 * the test decides: an assign- or edit-grant, or - for a manager who also holds
 * an authoring role - the author's own edit scope (owner or edit grant). The
 * authoring role alone never opens it: `assignments.manage` is the manager's.
 */
export async function canAssignTest(
  roles: readonly Role[],
  userId: string,
  test: TestRef,
): Promise<boolean> {
  if (isAdminOrSuper(roles)) return true;
  if (hasRole(roles, ROLES.MANAGER)) {
    if (hasAuthoringRole(roles) && (await canEditTest(roles, userId, test))) return true;
    const grant = await storage.getTestGrantForUser(test.id, userId);
    if (grant?.accessLevel === "assign" || grant?.accessLevel === "edit") return true;
    return (await folderRightsForTest(userId, test)).assign;
  }
  return false;
}

/** Can read the test's analytics: author edit-scope or manager assign-scope. */
export async function canReadTestAnalytics(
  roles: readonly Role[],
  userId: string,
  test: TestRef,
): Promise<boolean> {
  if (isAdminOrSuper(roles)) return true;
  if (hasAuthoringRole(roles) && (await canEditTest(roles, userId, test))) return true;
  if (hasRole(roles, ROLES.MANAGER) && (await canAssignTest(roles, userId, test))) return true;
  return false;
}

/**
 * Granting access to a test: the owner of that test (PRD-15 BRC-27) or an
 * administrator/superadmin. The capability `tests.access.grant` is now held by
 * authors too, so this object-level check is what stops an author granting on a
 * test they do not own.
 */
export function canGrantAccess(roles: readonly Role[], userId: string, test: TestRef): boolean {
  if (isAdminOrSuper(roles)) return true;
  return hasAuthoringRole(roles) && test.ownerId === userId;
}

/** Changing the test owner is admin/superadmin only. */
export function canChangeOwner(roles: readonly Role[]): boolean {
  return isAdminOrSuper(roles);
}

/**
 * The set of test ids a user may READ, for list and analytics filtering. For
 * administrators/superadmin returns `{ all: true }` (no id set needed).
 * Otherwise the union of owned tests and edit-grants (authoring roles) and all
 * grants (manager role), plus the tests of folders where the same levels are
 * inherited along the folder chain.
 */
export async function readableTestScope(
  roles: readonly Role[],
  userId: string,
): Promise<{ all: boolean; ids: Set<string> }> {
  if (isAdminOrSuper(roles)) return { all: true, ids: new Set() };
  const ids = new Set<string>();
  const wantsAuthor = hasAuthoringRole(roles);
  const wantsManager = hasRole(roles, ROLES.MANAGER);
  if (wantsAuthor) {
    for (const id of await storage.getTestIdsByOwner(userId)) ids.add(id);
  }
  if (wantsAuthor || wantsManager) {
    const grants = await storage.getUserTestGrants(userId);
    for (const g of grants) {
      if (wantsManager) ids.add(g.testId); // manager: assign or edit grant
      else if (g.accessLevel === "edit") ids.add(g.testId); // author: edit grant only
    }
    // Folder grants count with the same levels as test grants for the role.
    const levels = new Set<FolderAccessLevel>(wantsManager ? ["edit", "assign"] : ["edit"]);
    for (const id of await testIdsByFolderRights(userId, levels)) ids.add(id);
  }
  return { all: false, ids };
}
