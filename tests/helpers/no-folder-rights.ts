/**
 * @module tests/helpers/no-folder-rights
 * @description Stand-in for `server/services/test-folder-access` in route suites
 * whose storage mock does not model the test folder tree: no folder gives any
 * right, so the suites keep asserting the owner and grant branches exactly as
 * before folder inheritance. The inheritance itself is covered by
 * tests/access/test-folder-access.test.ts.
 *
 * Usage, next to the storage mock:
 *
 * ```ts
 * vi.mock("../server/services/test-folder-access", () => import("./helpers/no-folder-rights"));
 * ```
 */

const NONE = { owner: false, edit: false, assign: false, review: false };

/** No inherited rights in any folder. */
export async function folderRights(): Promise<typeof NONE> {
  return { ...NONE };
}

/** No inherited rights on any test. */
export async function folderRightsForTest(): Promise<typeof NONE> {
  return { ...NONE };
}

/** No rights in any folder. */
export async function folderRightsMap(): Promise<Map<string, typeof NONE>> {
  return new Map<string, typeof NONE>();
}

/** No folder tree, hence no cycles. */
export async function isInSubtree(): Promise<boolean> {
  return false;
}

/** No test is reachable through a folder grant. */
export async function testIdsByFolderRights(): Promise<string[]> {
  return [];
}

/** No folder is visible through a folder right. */
export async function visibleTestFolders(): Promise<Map<string, "direct" | "transit">> {
  return new Map();
}

/** Empty folder tree. */
export async function loadTestFolderNodes(): Promise<Map<string, never>> {
  return new Map<string, never>();
}
