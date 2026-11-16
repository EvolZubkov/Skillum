/**
 * @module shared/access/folder-inheritance
 * @description Pure rules of folder access inheritance
 * (docs/specs/2026-11-16-folder-access-inheritance-design.md). The effective
 * right on an item is the UNION of the item's own grants, the grants of its
 * folder and of every ancestor folder, and ownership of any folder in the
 * chain. There are no denials. The module has no I/O, so the server and the
 * client resolve rights identically.
 */

/** Grant level on a folder; the same vocabulary as grants on tests. */
export type FolderAccessLevel = "edit" | "assign" | "review";

/** A folder reduced to what inheritance needs. */
export interface FolderNode {
  id: string;
  parentId: string | null;
  ownerId: string | null;
}

/** One grant on a folder. */
export interface FolderGrant {
  folderId: string;
  userId: string;
  accessLevel: FolderAccessLevel;
}

/** Rights a user holds on the content of a folder chain. */
export interface FolderRights {
  owner: boolean;
  edit: boolean;
  assign: boolean;
  review: boolean;
}

/** How a folder shows up in a user's tree. */
export type FolderVisibility = "direct" | "transit";

/** Rights of nobody: the value for a root item or a user without any folder right. */
export const NO_FOLDER_RIGHTS: Readonly<FolderRights> = Object.freeze({
  owner: false,
  edit: false,
  assign: false,
  review: false,
});

/**
 * Folder chain from the folder itself up to the root. A root item (`null`) or
 * an unknown id yields an empty chain. A cycle in `parentId` (corrupt data)
 * ends the walk instead of looping.
 *
 * @param folderId - Folder the item lives in, `null` for the root.
 * @param nodes - Every folder of the tree, keyed by id.
 * @returns The chain, nearest folder first.
 */
export function ancestorChain(
  folderId: string | null,
  nodes: ReadonlyMap<string, FolderNode>,
): FolderNode[] {
  const chain: FolderNode[] = [];
  const seen = new Set<string>();
  let current = folderId ? nodes.get(folderId) : undefined;
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return chain;
}

/**
 * Rights of one user on the content of `chain`. The owner of any folder in the
 * chain holds every right; `edit` covers `assign` and `review` (as for grants
 * on tests).
 *
 * @param chain - Result of {@link ancestorChain}.
 * @param grants - Folder grants; those of other users or folders are ignored.
 * @param userId - Whose rights to resolve.
 * @returns The union of the rights found along the chain.
 */
export function folderRightsOf(
  chain: readonly FolderNode[],
  grants: readonly FolderGrant[],
  userId: string,
): FolderRights {
  const ids = new Set(chain.map((n) => n.id));
  const owner = chain.some((n) => n.ownerId === userId);
  const levels = new Set(
    grants.filter((g) => g.userId === userId && ids.has(g.folderId)).map((g) => g.accessLevel),
  );
  const edit = owner || levels.has("edit");
  return {
    owner,
    edit,
    assign: edit || levels.has("assign"),
    review: edit || levels.has("review"),
  };
}

/**
 * Which folders the user sees. A folder is `direct` when the user owns it or
 * holds a grant (of one of `levels`) on it or on an ancestor. Every other
 * folder on the path to an accessible item is `transit`: it may be opened but
 * nothing in it is changed. Everything else, empty folders included, is absent.
 *
 * @param nodes - Every folder of the tree, keyed by id.
 * @param userId - Whose tree to build.
 * @param grants - Folder grants.
 * @param levels - Grant levels that make a folder `direct` for this caller.
 * @param accessibleItemFolderIds - Folders holding at least one accessible item.
 * @returns Visible folder ids with their mark.
 */
export function visibleFolderMap(
  nodes: ReadonlyMap<string, FolderNode>,
  userId: string,
  grants: readonly FolderGrant[],
  levels: ReadonlySet<FolderAccessLevel>,
  accessibleItemFolderIds: ReadonlySet<string>,
): Map<string, FolderVisibility> {
  const result = new Map<string, FolderVisibility>();
  const grantedIds = new Set(
    grants.filter((g) => g.userId === userId && levels.has(g.accessLevel)).map((g) => g.folderId),
  );
  for (const n of nodes.values()) {
    const chain = ancestorChain(n.id, nodes);
    if (chain.some((c) => c.ownerId === userId || grantedIds.has(c.id))) {
      result.set(n.id, "direct");
    }
  }
  for (const folderId of accessibleItemFolderIds) {
    for (const c of ancestorChain(folderId, nodes)) {
      if (!result.has(c.id)) result.set(c.id, "transit");
    }
  }
  return result;
}
