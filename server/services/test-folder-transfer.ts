/**
 * @module server/services/test-folder-transfer
 *
 * Moving a test or a test folder under folder access inheritance
 * (docs/specs/2026-11-16-folder-access-inheritance-design.md, "Перенос"). A move
 * KEEPS the rights: what the subject inherited from its old folder chain is
 * copied onto it as direct grants before it moves, so nobody loses access.
 * The destination chain may add people; {@link planMove} reports them so the
 * route can ask for confirmation before widening access.
 *
 * Materialisation is additive and idempotent: it never removes or downgrades a
 * grant, so a failure halfway leaves only extra direct grants behind.
 */

import { ancestorChain, type FolderAccessLevel, type FolderNode } from "@shared/access";
import type { TestFolderAccessGrant } from "@shared/schema";
import { storage } from "../storage";
import { loadTestFolderNodes } from "./test-folder-access";

/** What is being moved. */
export type MoveSubject = { kind: "test"; id: string } | { kind: "folder"; id: string };

/** A grant to copy onto the moved subject. */
export interface MaterializedGrant {
  userId: string;
  accessLevel: FolderAccessLevel;
}

/** What a move does to access, computed before it happens. */
export interface MovePlan {
  /** Grants inherited from the old chain that the subject does not hold directly yet. */
  materialize: MaterializedGrant[];
  /** People who reach the subject after the move but do not reach it now, with their level there. */
  gained: MaterializedGrant[];
}

/** Rank of a level: `edit` covers `assign`. */
const RANK: Record<FolderAccessLevel, number> = { assign: 1, edit: 2 };

/** Per-user strongest level among `entries`, in the order users were first met. */
function strongest(entries: readonly MaterializedGrant[]): Map<string, FolderAccessLevel> {
  const byUser = new Map<string, FolderAccessLevel>();
  for (const e of entries) {
    const current = byUser.get(e.userId);
    if (!current || RANK[e.accessLevel] > RANK[current]) byUser.set(e.userId, e.accessLevel);
  }
  return byUser;
}

/** Grants and owners along `chain`, owners counted as `edit`. */
function chainEntries(chain: readonly FolderNode[], grants: readonly TestFolderAccessGrant[]): MaterializedGrant[] {
  const ids = new Set(chain.map((n) => n.id));
  const entries: MaterializedGrant[] = grants
    .filter((g) => ids.has(g.folderId))
    .map((g) => ({ userId: g.userId, accessLevel: g.accessLevel }));
  for (const n of chain) if (n.ownerId) entries.push({ userId: n.ownerId, accessLevel: "edit" });
  return entries;
}

/** The subject's own owner and direct grants, plus the folder its chain starts from. */
async function loadSubject(
  subject: MoveSubject,
  nodes: ReadonlyMap<string, FolderNode>,
  grants: readonly TestFolderAccessGrant[],
): Promise<{ ownerId: string | null; direct: MaterializedGrant[]; chainStart: string | null }> {
  if (subject.kind === "test") {
    const test = await storage.getTest(subject.id);
    if (!test) throw new Error(`Test not found: ${subject.id}`);
    // Only the WORKING grants count: a reviewer of this test is not its working audience,
    // and a move neither copies nor touches review grants (they live on tests only).
    const direct: MaterializedGrant[] = [];
    for (const g of await storage.getTestAccessGrants(subject.id)) {
      if (g.accessLevel !== "review") direct.push({ userId: g.userId, accessLevel: g.accessLevel });
    }
    return { ownerId: test.ownerId ?? null, direct, chainStart: test.folderId ?? null };
  }
  const folder = nodes.get(subject.id);
  if (!folder) throw new Error(`Test folder not found: ${subject.id}`);
  const direct = grants
    .filter((g) => g.folderId === subject.id)
    .map((g) => ({ userId: g.userId, accessLevel: g.accessLevel }));
  // A folder keeps its own grants when it moves; only its ancestors' rights are inherited.
  return { ownerId: folder.ownerId, direct, chainStart: folder.parentId };
}

/**
 * Plans the move of `subject` into `destFolderId` without writing anything.
 *
 * @param subject - The test or folder to move.
 * @param destFolderId - Destination folder, `null` for the root.
 * @returns Grants to copy and the users the destination adds.
 */
export async function planMove(subject: MoveSubject, destFolderId: string | null): Promise<MovePlan> {
  const [nodes, grants] = await Promise.all([loadTestFolderNodes(), storage.getTestFolderGrants()]);
  const { ownerId, direct, chainStart } = await loadSubject(subject, nodes, grants);

  const inherited = strongest(chainEntries(ancestorChain(chainStart, nodes), grants));
  const held = strongest(direct);

  const materialize: MaterializedGrant[] = [];
  for (const [userId, level] of inherited) {
    if (userId === ownerId) continue;
    const own = held.get(userId);
    // Never downgrade: a direct grant at least as strong already keeps the access.
    if (!own || RANK[own] < RANK[level]) materialize.push({ userId, accessLevel: level });
  }

  const audience = new Set<string>([...inherited.keys(), ...held.keys()]);
  if (ownerId) audience.add(ownerId);
  const destination = strongest(chainEntries(ancestorChain(destFolderId, nodes), grants));
  const gained = [...destination]
    .filter(([userId]) => !audience.has(userId))
    .map(([userId, accessLevel]) => ({ userId, accessLevel }));

  return { materialize, gained };
}

/**
 * Copies the planned grants onto the subject. Additive and idempotent.
 *
 * @param subject - The test or folder about to move.
 * @param plan - Result of {@link planMove} for the same subject.
 * @param actorId - Who performs the move (recorded as `grantedBy`).
 */
export async function materializeInheritedGrants(
  subject: MoveSubject,
  plan: MovePlan,
  actorId: string | null,
): Promise<void> {
  for (const g of plan.materialize) {
    if (subject.kind === "test") {
      await storage.upsertTestAccessGrant({
        testId: subject.id, userId: g.userId, accessLevel: g.accessLevel, grantedBy: actorId,
      });
    } else {
      await storage.upsertTestFolderGrant({
        folderId: subject.id, userId: g.userId, accessLevel: g.accessLevel, grantedBy: actorId,
      });
    }
  }
}
