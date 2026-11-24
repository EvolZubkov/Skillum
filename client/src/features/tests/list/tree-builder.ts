/**
 * @module features/tests/list/tree-builder
 * @description Pure builders that turn raw test/folder arrays into the flat
 * row streams consumed by the tests-list page.
 *
 * - {@link buildTreeRows} — explorer-tree for the default / collapsed / menu
 *   states. Folders can be arbitrarily nested (the wireframe shows single-
 *   level, but the schema allows `parentId`).
 * - {@link buildSearchRows} — plain list of search hits with breadcrumb path.
 *
 * Both helpers are deterministic and side-effect free so they can be unit
 * tested without rendering anything.
 */
import type {
  FolderEntry,
  FolderScope,
  SearchRow,
  SortKey,
  TestListEntry,
  TreeRow,
} from "./tests-list.types";

/** Default folder ordering: alphabetical by `name` (case-insensitive). */
function compareFoldersByName(a: FolderEntry, b: FolderEntry): number {
  return a.name.localeCompare(b.name, "ru");
}

/** Apply the requested sort to a flat list of tests. */
export function sortTests(tests: TestListEntry[], sort: SortKey): TestListEntry[] {
  const copy = [...tests];
  if (sort === "title_asc") {
    copy.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    return copy;
  }
  if (sort === "updated_desc") {
    copy.sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
    return copy;
  }
  // created_desc — default
  copy.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
  return copy;
}

function timestamp(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Filter out archived tests (FR-31). The archive page handles those. */
export function excludeArchived(tests: TestListEntry[]): TestListEntry[] {
  return tests.filter((t) => t.status !== "archived");
}

/**
 * Build the row stream for the default explorer tree.
 *
 * Order in output:
 *   1. `root` pseudo-row with the total visible test count.
 *   2. Top-level folders (alphabetical), each followed by its descendant
 *      folders and tests in DFS order. Folders that are not in
 *      `expandedFolderIds` emit a folder row but skip their children.
 *   3. Root-level tests (no `folderId`) after all folders, sorted by `sort`.
 *
 * With `folderScope` set (the «Мои» / «Доступные» condition of the filter) a folder
 * is emitted when its owner falls into the scope — even if no test inside matches
 * the other conditions — or when it lies on the path to such a folder or to one of
 * `tests` (which the caller has already filtered). Without it every folder is emitted.
 *
 * @param args.tests - Tests to place, already filtered by the caller.
 * @param args.folders - Every folder the reader can see.
 * @param args.expandedFolderIds - Folders whose children are emitted.
 * @param args.sort - Ordering of tests inside each level.
 * @param args.folderScope - Ownership scope applied to folders; omitted = all folders.
 * @returns The flat row stream, starting with the `root` row.
 */
export function buildTreeRows(args: {
  tests: TestListEntry[];
  folders: FolderEntry[];
  expandedFolderIds: ReadonlySet<string>;
  sort: SortKey;
  folderScope?: FolderScope;
}): TreeRow[] {
  const sorted = sortTests(args.tests, args.sort);

  // Group tests by folder for O(n) lookups during DFS.
  const testsByFolder = new Map<string | null, TestListEntry[]>();
  for (const t of sorted) {
    const key = t.folderId ?? null;
    if (!testsByFolder.has(key)) testsByFolder.set(key, []);
    testsByFolder.get(key)!.push(t);
  }

  // Index folders by parent for tree traversal.
  const foldersByParent = new Map<string | null, FolderEntry[]>();
  for (const f of args.folders) {
    const key = f.parentId ?? null;
    if (!foldersByParent.has(key)) foldersByParent.set(key, []);
    foldersByParent.get(key)!.push(f);
  }
  for (const list of foldersByParent.values()) list.sort(compareFoldersByName);

  const visible = args.folderScope
    ? scopedFolderIds(args.folderScope, foldersByParent, testsByFolder)
    : null;

  const rows: TreeRow[] = [{ kind: "root", testsCount: sorted.length }];

  const walk = (parentId: string | null, depth: number) => {
    const folders = foldersByParent.get(parentId) ?? [];
    for (const folder of folders) {
      if (visible && !visible.has(folder.id)) continue;
      const folderTests = testsByFolder.get(folder.id) ?? [];
      const expanded = args.expandedFolderIds.has(folder.id);
      rows.push({
        kind: "folder",
        id: folder.id,
        name: folder.name,
        depth,
        parentId,
        testsCount: countTestsRecursive(folder.id, foldersByParent, testsByFolder),
        expanded,
      });
      if (!expanded) continue;
      // Sub-folders first, then tests inside this folder.
      walk(folder.id, depth + 1);
      for (const test of folderTests) {
        rows.push({
          kind: "test",
          id: test.id,
          entry: test,
          depth: depth + 1,
          parentId: folder.id,
        });
      }
    }
  };

  walk(null, 1);

  // Root-level tests (folderId === null) at level 1, after all folders.
  for (const test of testsByFolder.get(null) ?? []) {
    rows.push({ kind: "test", id: test.id, entry: test, depth: 1, parentId: null });
  }

  return rows;
}

/**
 * Ids of the folders that stay in the tree under an ownership scope: folders whose
 * owner falls into the scope, plus every ancestor of such a folder or of a folder
 * holding one of the (already filtered) tests.
 *
 * @param scope - The ownership scope of the filter.
 * @param foldersByParent - Folders indexed by parent id.
 * @param testsByFolder - Filtered tests indexed by folder id.
 * @returns The set of folder ids to emit.
 */
function scopedFolderIds(
  scope: FolderScope,
  foldersByParent: Map<string | null, FolderEntry[]>,
  testsByFolder: Map<string | null, TestListEntry[]>,
): Set<string> {
  const inScope = (folder: FolderEntry): boolean => {
    const mine = folder.ownerId === scope.userId;
    return scope.kind === "mine" ? mine : !mine;
  };
  const result = new Set<string>();
  // Post-order: a folder is visible when it is in scope itself, holds a test, or
  // has a visible sub-folder — so a foreign parent stays as the path.
  const visit = (folder: FolderEntry): boolean => {
    let keep = inScope(folder) || (testsByFolder.get(folder.id)?.length ?? 0) > 0;
    for (const child of foldersByParent.get(folder.id) ?? []) {
      if (visit(child)) keep = true;
    }
    if (keep) result.add(folder.id);
    return keep;
  };
  for (const root of foldersByParent.get(null) ?? []) visit(root);
  return result;
}

function countTestsRecursive(
  folderId: string,
  foldersByParent: Map<string | null, FolderEntry[]>,
  testsByFolder: Map<string | null, TestListEntry[]>,
): number {
  let count = (testsByFolder.get(folderId) ?? []).length;
  for (const child of foldersByParent.get(folderId) ?? []) {
    count += countTestsRecursive(child.id, foldersByParent, testsByFolder);
  }
  return count;
}

/**
 * Build the row stream for search results (state `s-search`).
 *
 * Filter is case-insensitive substring match on `title`. Sorting from
 * {@link sortTests} is applied. Each row carries the parent folder name (or
 * `null` for root-level tests) so the page can render the breadcrumb under
 * the test name.
 */
export function buildSearchRows(args: {
  tests: TestListEntry[];
  folders: FolderEntry[];
  query: string;
  sort: SortKey;
}): SearchRow[] {
  const q = args.query.trim().toLowerCase();
  if (q === "") return [];

  const folderById = new Map(args.folders.map((f) => [f.id, f]));
  const matches = args.tests.filter((t) => t.title.toLowerCase().includes(q));
  const sorted = sortTests(matches, args.sort);

  return sorted.map((entry) => ({
    kind: "search-result" as const,
    id: entry.id,
    entry,
    folderName: entry.folderId ? folderById.get(entry.folderId)?.name ?? null : null,
  }));
}

/**
 * Build the depth-first list of descendant folder ids for the move-to-folder
 * picker. Used to grey out / exclude the folder being moved and its descendants
 * (you cannot move a folder into itself or below itself).
 */
export function descendantFolderIds(
  folderId: string,
  folders: FolderEntry[],
): Set<string> {
  const result = new Set<string>([folderId]);
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of folders) {
      if (child.parentId === current && !result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return result;
}
