/**
 * @module features/tests/access/inherited-access-table
 *
 * Read-only «Унаследовано» section of the access panels of a test and of a test
 * folder (folder access inheritance, wireframe
 * `docs/wireframes/approved/test-folder-access.html`): who reaches the item
 * through the folders above it. Such access is removed only in its source
 * folder, so the folder cell opens that folder's panel when the reader may
 * manage it, and is plain text otherwise. Nothing is rendered without rows.
 */
import { Avatar, Button, Cluster, Stack, Table, Text } from "@skillum/ui-kit";
import { displayName, initials, levelLabel, type AccessLevel, type AccessUser } from "./access-people";

/** One inherited row as the server sends it. */
export interface InheritedRow {
  userId: string;
  accessLevel: AccessLevel;
  folderId: string;
  folderName: string;
}

/**
 * The section, or nothing when no access is inherited.
 *
 * @param props.rows - Inherited rows, one per person.
 * @param props.usersById - People known to the panel, for names and avatars.
 * @param props.manageableFolderIds - Folders whose panel the reader may open.
 * @param props.onOpenFolder - Opens the access panel of a source folder.
 */
export function InheritedAccessTable(props: {
  rows: readonly InheritedRow[];
  usersById: ReadonlyMap<string, AccessUser>;
  manageableFolderIds?: ReadonlySet<string>;
  onOpenFolder?: (folder: { id: string; name: string }) => void;
}) {
  if (props.rows.length === 0) return null;
  const { onOpenFolder } = props;
  return (
    <Stack as="section" gap={3}>
      <Text variant="body-s" weight="semibold" tone="muted" className="tb-caps">Унаследовано</Text>
      <Table<InheritedRow>
        rowKey={(r) => r.userId}
        rows={[...props.rows]}
        columns={[
          {
            key: "user",
            header: "Пользователь",
            render: (r) => {
              const u = props.usersById.get(r.userId);
              return (
                <Cluster as="span" gap={2} wrap={false}>
                  <Avatar initials={initials(u)} size="xs" />
                  <span>{displayName(u)}</span>
                </Cluster>
              );
            },
          },
          { key: "level", header: "Уровень", width: 200, render: (r) => levelLabel(r.accessLevel) },
          {
            key: "folder",
            header: "Папка",
            render: (r) =>
              onOpenFolder && props.manageableFolderIds?.has(r.folderId) ? (
                <Button
                  variant="ghost"
                  size="s"
                  onClick={() => onOpenFolder({ id: r.folderId, name: r.folderName })}
                >
                  {r.folderName}
                </Button>
              ) : (
                <span>{r.folderName}</span>
              ),
          },
        ]}
      />
    </Stack>
  );
}
