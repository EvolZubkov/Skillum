/**
 * @module features/tests/access/folder-access-panel
 *
 * «Общий доступ» panel of a TEST FOLDER (folder access inheritance,
 * docs/specs/2026-11-16-folder-access-inheritance-design.md; wireframe
 * `docs/wireframes/approved/test-folder-access.html`, states s-folder-access and
 * s-folder-access-empty). The same layout and behaviour as the test panel
 * ({@link ../test-access-panel}): the owner, the folder's own grants
 * (`edit` / `assign`; review is granted on a test only) accumulated as a draft
 * and applied on an explicit «Сохранить», and the read-only «Унаследовано»
 * section with the access the folder gets from the folders above it.
 *
 * Every test and sub-folder below inherits the grants written here. The panel is
 * opened by the folder owner or an administrator (`canManageAccess` of the
 * folder row); the server checks it on every endpoint. «Сменить владельца» is
 * offered to the holders of `tests.owner.change`, the right of a test owner change.
 *
 * Only people with an administrative role are offered as an owner or a grantee
 * (role-model 6.0); the owner is picked in a searchable field, as a grantee is.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Box,
  Button,
  Cluster,
  Combobox,
  Drawer,
  EmptyState,
  IconButton,
  Select,
  Stack,
  Table,
  Text,
  useToast,
} from "@skillum/ui-kit";
import { KeyRound, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
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

/** `GET /api/test-folders/:id/access`. */
interface FolderAccessResponse {
  ownerId: string | null;
  grants: GrantRow[];
  inherited: InheritedRow[];
}

/** Reads the error text of a failed answer, with a fallback. */
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || fallback);
}

/**
 * The panel; closed while `folder` is `null`.
 *
 * @param props.folder - The folder whose access is managed.
 * @param props.onClose - Closes the panel.
 * @param props.manageableFolderIds - Folders whose panel the reader may open.
 * @param props.onOpenFolder - Opens the panel of a source folder of «Унаследовано».
 */
export function FolderAccessPanel({
  folder,
  onClose,
  manageableFolderIds,
  onOpenFolder,
}: {
  folder: { id: string; name: string } | null;
  onClose: () => void;
  manageableFolderIds?: ReadonlySet<string>;
  onOpenFolder?: (folder: { id: string; name: string }) => void;
}) {
  const { push: toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const open = folder !== null;
  const folderId = folder?.id ?? null;
  const canChangeOwner = can("tests.owner.change");

  // The people come from the panel's own gate, not `GET /api/users`: a folder
  // owner grants access yet holds no registry right.
  const { data: users = [] } = useQuery<AccessUser[]>({
    queryKey: [`/api/test-folders/${folderId}/access/users`],
    enabled: open,
  });

  const { data: access } = useQuery<FolderAccessResponse>({
    queryKey: ["/api/test-folders", folderId, "access"],
    queryFn: async () => {
      const res = await fetch(`/api/test-folders/${folderId}/access`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить доступ");
      return res.json();
    },
    enabled: open && !!folderId,
  });

  // Local draft, applied on «Сохранить» -------------------------------------
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [changingOwner, setChangingOwner] = useState(false);
  const [addUserId, setAddUserId] = useState<string | null>(null);
  const [addLevel, setAddLevel] = useState<AccessLevel>("edit");

  // Reseed the draft whenever the loaded access changes (i.e. per opened folder).
  useEffect(() => {
    if (!access) return;
    setOwnerId(access.ownerId);
    setGrants(access.grants.map((g) => ({ userId: g.userId, accessLevel: g.accessLevel })));
    setChangingOwner(false);
    setAddUserId(null);
    setAddLevel("edit");
  }, [access]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const grantedIds = useMemo(() => new Set(grants.map((g) => g.userId)), [grants]);
  const addableUsers = useMemo(
    () => users.filter((u) => u.id !== ownerId && !grantedIds.has(u.id) && mayReceiveAccess(u)),
    [users, ownerId, grantedIds],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!folderId || !access) return;
      const base = `/api/test-folders/${folderId}`;
      if (ownerId !== access.ownerId) {
        const res = await fetch(`${base}/owner`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ownerId }),
        });
        if (!res.ok) throw await failure(res, "Не удалось сменить владельца");
      }
      const initial = new Map(access.grants.map((g) => [g.userId, g.accessLevel]));
      for (const g of grants) {
        if (initial.get(g.userId) !== g.accessLevel) {
          const res = await fetch(`${base}/access`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ userId: g.userId, accessLevel: g.accessLevel }),
          });
          if (!res.ok) throw await failure(res, "Не удалось выдать доступ");
        }
      }
      const keep = new Set(grants.map((g) => g.userId));
      for (const g of access.grants) {
        if (!keep.has(g.userId)) {
          const res = await fetch(`${base}/access/${g.userId}`, { method: "DELETE", credentials: "include" });
          if (!res.ok) throw await failure(res, "Не удалось отозвать доступ");
        }
      }
    },
    onSuccess: () => {
      // The folder's grants change what the folder list and the tests below show.
      queryClient.invalidateQueries({ queryKey: ["/api/test-folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
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

  const owner = ownerId ? usersById.get(ownerId) : undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="wide"
      title="Общий доступ"
      description={folder ? `Папка «${folder.name}»` : undefined}
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
              aria-label="Владелец папки"
              fullWidth
              placeholder="Найдите владельца…"
              value={ownerId}
              options={ownerOptions(users, access?.ownerId ?? null)}
              // Clearing the field does not unset the owner: a folder always keeps one.
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
              {canChangeOwner && (
                <Button variant="secondary" size="s" onClick={() => setChangingOwner(true)}>
                  Сменить владельца
                </Button>
              )}
            </Cluster>
          )}
        </Stack>

        {/* Own grants */}
        <Stack as="section" gap={3}>
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
              // The per-row level Select renders its menu inline; `tb-tbl--menus`
              // keeps the DS Table from clipping it (see the test panel).
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
