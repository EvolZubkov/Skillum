/**
 * @module features/tests/access/test-access-panel
 *
 * Per-test access management panel (PRD-13, WF-2). Shows the test owner and the
 * list of edit/assign grants, lets an administrator change the owner, add, retune
 * or revoke grants, and applies every change at once on an explicit "Сохранить".
 * The panel is admin/superadmin only — the caller gates the trigger by the
 * `tests.access.grant` capability; the server enforces it on every endpoint.
 *
 * Reviewers (PRD-52, 14.8) have a section of their own below the grants: who is invited to
 * review the test and how (by account or by link). They are invited from the review dialog;
 * the panel only lists and revokes them, and a revocation never touches a working grant.
 *
 * Folder access inheritance: below the reviewers, the read-only «Унаследовано»
 * section lists who reaches the test through its folder chain; a source folder
 * opens its own panel, where that access is removed.
 *
 * Only people with an administrative role are offered as an owner or a grantee
 * (role-model 6.0); the owner is picked in a searchable field, as a grantee is.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Drawer, Button, IconButton, Avatar, Select, Combobox, EmptyState, Table, Box, Stack, Cluster, Text, useToast } from "@skillum/ui-kit";
import { Trash2, KeyRound } from "lucide-react";
import {
  LEVEL_OPTIONS,
  displayName,
  initials,
  mayReceiveAccess,
  ownerOptions,
  personOption,
  type AccessLevel,
  type AccessUser,
} from "./access-people";
import { InheritedAccessTable, type InheritedRow } from "./inherited-access-table";

interface GrantRow {
  userId: string;
  accessLevel: AccessLevel;
}

/** A reviewer as `GET /api/tests/:id/review/reviewers` sends them (PRD-52). */
interface ReviewerRow {
  userId: string;
  name: string | null;
  email: string | null;
  /** An external participant enters by the link only; a staff user by their own account. */
  external: boolean;
}

interface AccessResponse {
  testId: string;
  ownerId: string | null;
  grants: GrantRow[];
  /** Access through the folder chain; absent in an answer older than folder access. */
  inherited?: InheritedRow[];
}

export function TestAccessPanel({
  test,
  onClose,
  manageableFolderIds,
  onOpenFolder,
}: {
  test: { id: string; title: string } | null;
  onClose: () => void;
  /** Folders whose access panel the reader may open from «Унаследовано». */
  manageableFolderIds?: ReadonlySet<string>;
  /** Opens the access panel of a source folder; without it folders show as text. */
  onOpenFolder?: (folder: { id: string; name: string }) => void;
}) {
  const { push: toast } = useToast();
  const queryClient = useQueryClient();
  const open = test !== null;
  const testId = test?.id ?? null;

  // Users feed the owner picker, the add-user combobox and the userId -> name map.
  // Read behind the panel's own gate: `GET /api/users` needs `users.read`, which the
  // author granting access to their own test does not hold.
  const { data: users = [] } = useQuery<AccessUser[]>({
    queryKey: [`/api/tests/${testId}/access/users`],
    enabled: open,
  });

  const { data: access } = useQuery<AccessResponse>({
    queryKey: ["/api/tests", testId, "access"],
    queryFn: async () => {
      const res = await fetch(`/api/tests/${testId}/access`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить доступ");
      return res.json();
    },
    enabled: open && !!testId,
  });

  // Reviewers sit in their own slot (PRD-52, 14.8): invited from the review dialog, listed
  // here read-mostly, revoked here like any other change — on «Сохранить».
  const { data: reviewers = [] } = useQuery<ReviewerRow[]>({
    queryKey: [`/api/tests/${testId}/review/reviewers`],
    queryFn: async () => {
      const res = await fetch(`/api/tests/${testId}/review/reviewers`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить рецензентов");
      return res.json();
    },
    enabled: open && !!testId,
  });

  // Local draft, accumulated until "Сохранить" (WF-2 explicit save) ------------
  const [revokedReviewers, setRevokedReviewers] = useState<Set<string>>(new Set());
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [changingOwner, setChangingOwner] = useState(false);
  const [addUserId, setAddUserId] = useState<string | null>(null);
  const [addLevel, setAddLevel] = useState<AccessLevel>("edit");

  // Reseed the draft whenever the loaded access changes (i.e. per opened test).
  useEffect(() => {
    if (!access) return;
    setOwnerId(access.ownerId);
    setGrants(access.grants.map((g) => ({ userId: g.userId, accessLevel: g.accessLevel })));
    setChangingOwner(false);
    setAddUserId(null);
    setAddLevel("edit");
    setRevokedReviewers(new Set());
  }, [access]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const grantedIds = useMemo(() => new Set(grants.map((g) => g.userId)), [grants]);
  const addableUsers = useMemo(
    () => users.filter((u) => u.id !== ownerId && !grantedIds.has(u.id) && mayReceiveAccess(u)),
    [users, ownerId, grantedIds],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!testId || !access) return;
      // Owner change.
      if (ownerId !== access.ownerId) {
        const res = await fetch(`/api/tests/${testId}/owner`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ownerId }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Не удалось сменить владельца");
      }
      // Additions and level changes (upsert).
      const initial = new Map(access.grants.map((g) => [g.userId, g.accessLevel]));
      for (const g of grants) {
        if (initial.get(g.userId) !== g.accessLevel) {
          const res = await fetch(`/api/tests/${testId}/access`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ userId: g.userId, accessLevel: g.accessLevel }),
          });
          if (!res.ok) throw new Error((await res.json()).error || "Не удалось выдать доступ");
        }
      }
      // Revocations.
      const keep = new Set(grants.map((g) => g.userId));
      for (const g of access.grants) {
        if (!keep.has(g.userId)) {
          const res = await fetch(`/api/tests/${testId}/access/${g.userId}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (!res.ok) throw new Error((await res.json()).error || "Не удалось отозвать доступ");
        }
      }
      // Reviewer revocations: the review slot only, the person's working grant stays.
      for (const userId of revokedReviewers) {
        const res = await fetch(`/api/tests/${testId}/review/reviewers/${userId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json()).error || "Не удалось отозвать рецензирование");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      if (testId) queryClient.invalidateQueries({ queryKey: [`/api/tests/${testId}/review/reviewers`] });
      if (testId) queryClient.invalidateQueries({ queryKey: ["/api/tests", testId, "access"] });
      toast({ tone: "success", title: "Доступ сохранён" });
      onClose();
    },
    onError: (e: Error) => toast({ tone: "error", title: "Ошибка", description: e.message }),
  });

  const addGrant = () => {
    if (!addUserId) return;
    setGrants((prev) => [...prev, { userId: addUserId, accessLevel: addLevel }]);
    setAddUserId(null);
    setAddLevel("edit");
  };
  const setGrantLevel = (userId: string, level: AccessLevel) =>
    setGrants((prev) => prev.map((g) => (g.userId === userId ? { ...g, accessLevel: level } : g)));
  const removeGrant = (userId: string) => setGrants((prev) => prev.filter((g) => g.userId !== userId));
  const revokeReviewer = (userId: string) =>
    setRevokedReviewers((prev) => new Set(prev).add(userId));
  const visibleReviewers = useMemo(
    () => reviewers.filter((r) => !revokedReviewers.has(r.userId)),
    [reviewers, revokedReviewers],
  );

  const owner = ownerId ? usersById.get(ownerId) : undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="wide"
      title="Общий доступ"
      description={test?.title}
      footer={
        <Cluster justify="end" gap={2} wrap={false}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Сохранить
          </Button>
        </Cluster>
      }
    >
      <Stack gap={6}>
        {/* Owner */}
        <Stack as="section" gap={3}>
          <Text variant="body-s" weight="semibold" tone="muted" className="tb-caps">Владелец</Text>
          {changingOwner ? (
            <Combobox
              aria-label="Владелец теста"
              fullWidth
              placeholder="Найдите владельца…"
              value={ownerId}
              options={ownerOptions(users, access?.ownerId ?? null)}
              // Clearing the field does not unset the owner: a test always keeps one.
              onChange={(v) => v && setOwnerId(v)}
            />
          ) : (
            <Cluster gap={3} wrap={false}>
              {owner ? (
                <>
                  <Avatar initials={initials(owner)} size="s" />
                  <span>{displayName(owner)}</span>
                </>
              ) : (
                <Text tone="muted">Владелец не назначен</Text>
              )}
              <Box as="span" grow />
              <Button variant="secondary" size="s" onClick={() => setChangingOwner(true)}>
                Сменить владельца
              </Button>
            </Cluster>
          )}
        </Stack>

        {/* Grants */}
        <Stack as="section" gap={3}>
          <Text variant="body-s" weight="semibold" tone="muted" className="tb-caps">Доступ к тесту</Text>
          <Cluster align="end" gap={3}>
            <Combobox
              aria-label="Выбрать пользователя"
              placeholder="Выберите пользователя…"
              value={addUserId}
              onChange={(v) => setAddUserId(v)}
              options={addableUsers.map(personOption)}
            />
            <Select<AccessLevel>
              aria-label="Уровень доступа"
              value={addLevel}
              options={LEVEL_OPTIONS}
              onChange={(v) => setAddLevel(v)}
            />
            <Button variant="primary" disabled={!addUserId} onClick={addGrant}>
              Добавить
            </Button>
          </Cluster>

          {grants.length === 0 ? (
            <EmptyState
              well
              art={<KeyRound width={24} height={24} aria-hidden="true" />}
              title="Доступ ещё никому не выдан"
            />
          ) : (
            <Table<GrantRow>
              // The per-row level Select renders its menu inline (position:
              // absolute), and the DS Table root (.ou-tbl) sets overflow:hidden
              // to clip its rounded corners — which also clips the open menu.
              // `tb-tbl--menus` relaxes it and keeps the corners rounded.
              className="tb-tbl--menus"
              rowKey={(g) => g.userId}
              rows={grants}
              columns={[
                {
                  key: "user",
                  header: "Пользователь",
                  render: (g) => {
                    const u = usersById.get(g.userId);
                    return (
                      <Cluster as="span" gap={2} wrap={false}>
                        <Avatar initials={initials(u)} size="xs" />
                        <span>{displayName(u)}</span>
                      </Cluster>
                    );
                  },
                },
                {
                  key: "level",
                  header: "Уровень",
                  width: 200,
                  render: (g) => (
                    <Select<AccessLevel>
                      aria-label="Уровень доступа"
                      value={g.accessLevel}
                      options={LEVEL_OPTIONS}
                      onChange={(v) => setGrantLevel(g.userId, v)}
                    />
                  ),
                },
                {
                  key: "actions",
                  header: "Действия",
                  width: 90,
                  align: "right",
                  render: (g) => (
                    <IconButton
                      variant="ghost"
                      size="s"
                      aria-label="Отозвать доступ"
                      icon={<Trash2 width={14} height={14} />}
                      onClick={() => removeGrant(g.userId)}
                    />
                  ),
                },
              ]}
            />
          )}
        </Stack>

        {/* Reviewers: a slot of their own beside the working grants (PRD-52, 14.8). */}
        <Stack as="section" gap={3}>
          <Text variant="body-s" weight="semibold" tone="muted" className="tb-caps">Рецензирование</Text>
          {visibleReviewers.length === 0 ? (
            <EmptyState well title="Рецензенты не приглашены" />
          ) : (
            <Table<ReviewerRow>
              rowKey={(r) => r.userId}
              rows={visibleReviewers}
              columns={[
                {
                  key: "user",
                  header: "Пользователь",
                  render: (r) => {
                    const u = usersById.get(r.userId) ?? { id: r.userId, name: r.name, email: r.email };
                    return (
                      <Cluster as="span" gap={2} wrap={false}>
                        <Avatar initials={initials(u)} size="xs" />
                        <span>{displayName(u)}</span>
                      </Cluster>
                    );
                  },
                },
                {
                  key: "how",
                  header: "Как приглашён",
                  width: 200,
                  render: (r) => (r.external ? "по ссылке" : "по аккаунту"),
                },
                {
                  key: "actions",
                  header: "Действия",
                  width: 90,
                  align: "right",
                  render: (r) => (
                    <IconButton
                      variant="ghost"
                      size="s"
                      aria-label="Отозвать рецензирование"
                      icon={<Trash2 width={14} height={14} />}
                      onClick={() => revokeReviewer(r.userId)}
                    />
                  ),
                },
              ]}
            />
          )}
          <Text variant="body-s" tone="muted">Рецензентов приглашают из окна «Отправить на рецензирование».</Text>
        </Stack>

        <InheritedAccessTable
          rows={access?.inherited ?? []}
          usersById={usersById}
          manageableFolderIds={manageableFolderIds}
          onOpenFolder={onOpenFolder}
        />
      </Stack>
    </Drawer>
  );
}
