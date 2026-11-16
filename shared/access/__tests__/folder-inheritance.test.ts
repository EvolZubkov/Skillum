/**
 * @module shared/access/__tests__/folder-inheritance.test
 * @description Pure inheritance rules for folder access: ancestor chain,
 * rights by chain and the visible-folder map
 * (docs/specs/2026-11-16-folder-access-inheritance-design.md).
 */
import { describe, it, expect } from "vitest";
import {
  ancestorChain,
  folderRightsOf,
  visibleFolderMap,
  type FolderNode,
  type FolderGrant,
} from "../folder-inheritance";

const node = (id: string, parentId: string | null, ownerId: string | null = null): FolderNode =>
  ({ id, parentId, ownerId });
const tree = (...nodes: FolderNode[]) => new Map(nodes.map((n) => [n.id, n]));

describe("ancestorChain", () => {
  it("returns the folder first and the root last", () => {
    const t = tree(node("a", null), node("b", "a"), node("c", "b"));
    expect(ancestorChain("c", t).map((n) => n.id)).toEqual(["c", "b", "a"]);
  });
  it("is empty for a root item (null folder) or an unknown folder", () => {
    const t = tree(node("a", null));
    expect(ancestorChain(null, t)).toEqual([]);
    expect(ancestorChain("zzz", t)).toEqual([]);
  });
  it("stops on a cycle instead of looping", () => {
    const t = tree(node("a", "b"), node("b", "a"));
    expect(ancestorChain("a", t).map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("folderRightsOf", () => {
  const t = tree(node("a", null, "owner"), node("b", "a"), node("c", "b"));
  const grant = (folderId: string, userId: string, accessLevel: FolderGrant["accessLevel"]): FolderGrant =>
    ({ folderId, userId, accessLevel });

  it("gives every right to the owner of any folder in the chain", () => {
    expect(folderRightsOf(ancestorChain("c", t), [], "owner"))
      .toEqual({ owner: true, edit: true, assign: true, review: true });
  });
  it("inherits an ancestor grant downwards", () => {
    const r = folderRightsOf(ancestorChain("c", t), [grant("a", "u", "assign")], "u");
    expect(r).toEqual({ owner: false, edit: false, assign: true, review: false });
  });
  it("lets edit cover assign and review", () => {
    const r = folderRightsOf(ancestorChain("b", t), [grant("b", "u", "edit")], "u");
    expect(r).toEqual({ owner: false, edit: true, assign: true, review: true });
  });
  it("ignores grants of other users and of folders outside the chain", () => {
    const r = folderRightsOf(
      ancestorChain("b", t),
      [grant("a", "other", "edit"), grant("c", "u", "edit")],
      "u",
    );
    expect(r).toEqual({ owner: false, edit: false, assign: false, review: false });
  });
});

describe("visibleFolderMap", () => {
  const t = tree(node("a", null), node("b", "a"), node("c", "b"), node("d", "a"), node("e", null));
  const grants: FolderGrant[] = [{ folderId: "d", userId: "u", accessLevel: "edit" }];

  it("marks granted folders direct and hides unrelated ones", () => {
    const m = visibleFolderMap(t, "u", grants, new Set(["edit"]), new Set());
    expect(m.get("d")).toBe("direct");
    expect(m.has("e")).toBe(false);
  });
  it("shows the path to an accessible item as transit folders", () => {
    const m = visibleFolderMap(t, "u", [], new Set(["edit"]), new Set(["c"]));
    expect([...m.entries()].sort()).toEqual([["a", "transit"], ["b", "transit"], ["c", "transit"]]);
  });
  it("hides empty folders without rights", () => {
    const m = visibleFolderMap(t, "u", [], new Set(["edit"]), new Set());
    expect(m.size).toBe(0);
  });
  it("shows a folder owned by the user and its subtree, even when empty", () => {
    const owned = tree(node("a", null, "u"), node("b", "a"));
    const m = visibleFolderMap(owned, "u", [], new Set(["edit"]), new Set());
    expect([...m.entries()].sort()).toEqual([["a", "direct"], ["b", "direct"]]);
  });
  it("counts only the levels the caller asks for", () => {
    const m = visibleFolderMap(t, "u", [{ folderId: "d", userId: "u", accessLevel: "assign" }],
      new Set(["edit"]), new Set());
    expect(m.size).toBe(0);
  });
});
