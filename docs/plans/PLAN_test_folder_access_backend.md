# Права на папки тестов: план 1 (бэкенд)

> **Для исполнителя:** используйте superpowers:executing-plans (или subagent-driven-development, если владелец
> разрешит субагентов). Шаги отмечены флажками `- [ ]`.

**Цель:** папки тестов получают владельца и гранты, права наследуются элементами вниз по цепочке предков, список
папок скрывает недоступное, перенос сохраняет права.

**Архитектура:** чистый модуль наследования в `shared/access/` (без БД, полностью юнит-тестируем), тонкий серверный
сервис `test-folder-access.ts` поверх хранилища, существующие проверки `test-access.ts` обращаются к сервису.
Спецификация: [2026-11-16-folder-access-inheritance-design.md](../specs/2026-11-16-folder-access-inheritance-design.md).

**Стек:** TypeScript, Drizzle ORM, Express, Vitest (юнит) и pglite (интеграционные). Новых зависимостей нет.

## Статус исполнения (2026-11-16)

Задачи 1-8 выполнены в ветке `feat/test-folder-access`. Отступления от текста плана:

- `DELETE /:id` в режиме `folder-only` по-прежнему отвечает `204` без тела: поле `gained` не
  возвращается, права вложенного копируются без запроса подтверждения.
- Перенос теста в ту же папку права не пересчитывает, но запись в хранилище выполняется, как раньше.
- В `test-folder-access.ts` добавлены `folderRightsMap` (права по всем папкам для списка) и
  `isInSubtree` (запрет переноса папки в собственное поддерево, ответ `400 cycle`).
- Маршрутные наборы, чей мок хранилища не моделирует дерево папок, подключают заглушку
  `tests/helpers/no-folder-rights.ts` (14 файлов).

Не входит в план и остаётся открытым: создание теста сразу в папке (`POST /api/tests` с
`folderId`) и импорт книги в папку права на папку пока не проверяют.

## Границы плана

Входит: схема, миграция, хранилище, чистый модуль, сервис, интеграция в `test-access.ts`, маршруты папок тестов,
перенос с копированием прав и превью расширения доступа.

Не входит: окно «Доступ» и диалог подтверждения переноса (план 2, по эскизам), ось тем (план 3).

**Планы 1 и 2 выпускаются вместе.** После плана 1 перенос с расширением доступа отвечает `409 access_gain` без
подтверждения, а старый клиент подтверждение не шлёт.

## Решения плана сверх спецификации

Спецификация не фиксирует эти пункты, план принимает их так (при несогласии поправить до начала работы):

1. Структурные операции над папкой (создать внутри, переименовать, переместить, удалить «только папку») требуют
   `edit` на папке. Создание в корне остаётся за `folders.manage`, как сейчас.
2. Удаление папки вместе с тестами (`folder-and-tests`) требует владельца папки или администратора.
3. Выдавать и отзывать гранты папки может только владелец папки или администратор (по образцу `canGrantAccess`).
   `canGrantAccess` для отдельных тестов не меняется: он синхронный, и перевод его на асинхронный затронет вызовы.
4. Грант `review` на папке даёт рецензирование всех тестов внутри; `edit` покрывает `assign` и `review`, как у
   грантов на тесты.

## Карта файлов

- Создать `shared/access/folder-inheritance.ts` — чистые функции: цепочка предков, права по цепочке, видимость.
- Создать `shared/access/__tests__/folder-inheritance.test.ts` — юнит-тесты модуля.
- Изменить `shared/access/index.ts` — реэкспорт.
- Изменить `shared/schema.ts` — таблица `test_folder_access_grants`, колонка `test_folders.owner_id`.
- Создать `drizzle/0066_test_folder_access.sql` (генерируется) — миграция с бэкфиллом `owner_id`.
- Изменить `server/storage/folders-repository.ts` и `server/storage/access-repository.ts` — методы хранилища.
- Изменить `server/storage.ts` — контракт `IStorage` и делегаты.
- Создать `server/services/test-folder-access.ts` — серверный резолвер.
- Создать `server/services/test-folder-transfer.ts` — превью и применение переноса.
- Изменить `server/services/test-access.ts` — подключение резолвера.
- Изменить `server/routes/test-folders.ts` — фильтрация списка, проверки прав, маршруты доступа и превью.
- Создать `tests/access/test-folder-access.test.ts`, `tests/access/test-folder-routes.test.ts` и
  `tests/it/test-folder-access.it.test.ts`.
- Изменить `tests/access/test-access.test.ts` — заглушка нового сервиса.

---

### Задача 1: чистый модуль наследования

**Файлы:**

- Создать: `shared/access/folder-inheritance.ts`
- Тест: `shared/access/__tests__/folder-inheritance.test.ts`
- Изменить: `shared/access/index.ts`

- [ ] **Шаг 1: написать падающий тест**

```ts
/**
 * @module shared/access/__tests__/folder-inheritance.test
 * @description Pure inheritance rules for folder access: ancestor chain,
 * rights by chain and the visible-folder map.
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

  it("marks granted folders and their subtree direct", () => {
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
  it("shows a folder owned by the user even when empty", () => {
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
```

- [ ] **Шаг 2: запустить и убедиться, что падает**

Команда: `npm test -- shared/access/__tests__/folder-inheritance.test.ts`

Ожидается: FAIL, модуль `../folder-inheritance` не найден.

- [ ] **Шаг 3: реализовать модуль**

```ts
/**
 * @module shared/access/folder-inheritance
 * @description Pure rules of folder access inheritance (docs/specs/2026-11-16-folder-access-inheritance-design.md).
 * The effective right on an item is the UNION of the item's own grants, the grants of its folder and of every
 * ancestor folder, and ownership of any folder in the chain. There are no denials. The module has no I/O, so
 * the server and (later) the client resolve rights identically.
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

/**
 * Folder chain from the folder itself up to the root. A root item (`null`) or an unknown id yields an empty
 * chain. A cycle in `parentId` (corrupt data) ends the walk instead of looping.
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
 * Rights of one user on the content of `chain`. The owner of any folder in the chain holds every right;
 * `edit` covers `assign` and `review` (as for grants on tests).
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
 * Which folders the user sees. A folder is `direct` when the user owns it or holds a grant (of one of `levels`)
 * on it or on an ancestor. Every other folder on the path to an accessible item (`accessibleItemFolderIds`) is
 * `transit`: it may be opened but nothing in it is changed. Everything else, empty folders included, is absent.
 */
export function visibleFolderMap(
  nodes: ReadonlyMap<string, FolderNode>,
  userId: string,
  grants: readonly FolderGrant[],
  levels: ReadonlySet<FolderAccessLevel>,
  accessibleItemFolderIds: ReadonlySet<string>,
): Map<string, FolderVisibility> {
  const result = new Map<string, FolderVisibility>();
  const relevant = grants.filter((g) => g.userId === userId && levels.has(g.accessLevel));
  for (const n of nodes.values()) {
    const chain = ancestorChain(n.id, nodes);
    const own = chain.some((c) => c.ownerId === userId)
      || relevant.some((g) => chain.some((c) => c.id === g.folderId));
    if (own) result.set(n.id, "direct");
  }
  for (const folderId of accessibleItemFolderIds) {
    for (const c of ancestorChain(folderId, nodes)) {
      if (!result.has(c.id)) result.set(c.id, "transit");
    }
  }
  return result;
}
```

- [ ] **Шаг 4: реэкспорт**

В `shared/access/index.ts` добавить строку `export * from "./folder-inheritance";` после `import-kinds`.

- [ ] **Шаг 5: запустить тест, убедиться, что проходит**

Команда: `npm test -- shared/access/__tests__/folder-inheritance.test.ts`

Ожидается: PASS, 12 тестов.

- [ ] **Шаг 6: показать дифф владельцу.** Коммит только по явному разрешению.

---

### Задача 2: схема и миграция

**Файлы:**

- Изменить: `shared/schema.ts` (таблица `testFolders` около строки 411, новая таблица рядом с `testAccessGrants`)
- Создать: `drizzle/0066_test_folder_access.sql` (генерируется)
- Изменить: `tests/it/schema.sql` (экспорт)

- [ ] **Шаг 1: правка схемы**

В `testFolders` добавить после `createdBy`:

```ts
  // Folder owner (docs/specs/2026-11-16-folder-access-inheritance-design.md). NULL = legacy folder,
  // managed by administrators only. Backfilled from `created_by`.
  ownerId: varchar("owner_id", { length: 36 }),
```

После `testAccessGrants` добавить таблицу по тому же образцу двух слотов (рабочий `edit`/`assign` и `review`):

```ts
/**
 * Grants on a TEST FOLDER. Inherited by every test and sub-folder below it (union with the grants on the
 * item itself). Same two independent slots per (folder, user) as `test_access_grants`.
 */
export const testFolderAccessGrants = pgTable("test_folder_access_grants", {
  id: varchar("id", { length: 36 }).primaryKey(),
  folderId: varchar("folder_id", { length: 36 }).notNull()
    .references(() => testFolders.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull(),
  accessLevel: text("access_level", { enum: ["edit", "assign", "review"] }).notNull(),
  grantedBy: varchar("granted_by", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  workIdx: uniqueIndex("test_folder_access_grants_work_idx")
    .on(table.folderId, table.userId)
    .where(sql`${table.accessLevel} <> 'review'`),
  reviewIdx: uniqueIndex("test_folder_access_grants_review_idx")
    .on(table.folderId, table.userId)
    .where(sql`${table.accessLevel} = 'review'`),
}));
```

Экспорт типов рядом с `TestAccessGrant`: `export type TestFolderAccessGrant = typeof testFolderAccessGrants.$inferSelect;`.

- [ ] **Шаг 2: сгенерировать миграцию**

Команда: `node_modules/.bin/drizzle-kit generate --name=test_folder_access`

Ожидается: создан `drizzle/0066_test_folder_access.sql`. Номер сверить с последним в каталоге (сейчас `0065`).

- [ ] **Шаг 3: дописать бэкфилл в конец сгенерированного файла**

```sql
--> statement-breakpoint
UPDATE "test_folders" SET "owner_id" = "created_by" WHERE "owner_id" IS NULL AND "created_by" IS NOT NULL;
```

Просмотреть файл целиком: должны быть только `CREATE TABLE`, два `CREATE UNIQUE INDEX`, `ALTER TABLE ... ADD COLUMN`
и `UPDATE`. Никаких `DROP` и смены типа. Памятка проекта: рукописный файл без записи в `meta/_journal.json`
не применяется, поэтому файл правится только после `generate`.

- [ ] **Шаг 4: обновить схему интеграционных тестов**

Команда: `npx drizzle-kit export --sql | grep -v '^DATABASE_URL:' > tests/it/schema.sql`

Проверить `git diff tests/it/schema.sql`: добавилась таблица и колонка, чужих изменений нет (снимок схемы pglite мог
отставать, см. памятку проекта: лишние расхождения не коммитить в этот шаг, а сообщить владельцу).

- [ ] **Шаг 5: проверка типов**

Команда: `npm run check`

Ожидается: без ошибок.

---

### Задача 3: хранилище

**Файлы:**

- Изменить: `server/storage/folders-repository.ts`, `server/storage/access-repository.ts`, `server/storage.ts`
- Тест: `tests/it/test-folder-access.it.test.ts`

Методы (все принимают и возвращают простые данные, логики прав нет):

- `getTestFolderGrants(): Promise<TestFolderAccessGrant[]>` — все гранты (дерево небольшое, список строится пачкой).
- `getTestFolderGrantsForFolder(folderId)` — для окна доступа.
- `upsertTestFolderGrant(grant)` и `removeTestFolderGrant(folderId, userId, slot)` — по образцу
  `upsertTestAccessGrant` и `removeTestAccessGrant` из `access-repository.ts:110-140`, конфликт по частичным индексам.
- `getTestFolderIdOfTest(testId): Promise<string | null | undefined>` — `undefined`, если теста нет.
- `getFolderIdsOfTests(testIds): Promise<Map<string, string | null>>`.
- `getTestIdsInFolders(folderIds): Promise<string[]>`.
- `setTestFolderOwner(folderId, ownerId)`.

`createTestFolder` дополнить: `ownerId: folder.createdBy || null` (владелец равен создателю). Это же покрывает импорт
книги (`workbook-import.ts:658`, передаёт `createdBy`).

- [ ] **Шаг 1: написать падающий интеграционный тест** (`tests/it/test-folder-access.it.test.ts`, каркас как в
  `tests/it/mass-assignment.it.test.ts`: `createHarness`, `vi.mock("../../server/db")`, `DatabaseStorage`)

Проверки: `createTestFolder` с `createdBy: "u1"` даёт `ownerId === "u1"`; `upsertTestFolderGrant` дважды с одним
(folder, user) заменяет `edit` на `assign`, а `review` лежит рядом отдельной строкой; удаление папки каскадом удаляет
её гранты; `getTestIdsInFolders(["f1"])` возвращает тесты только этой папки; `getFolderIdsOfTests` отдаёт `null` для
теста в корне.

- [ ] **Шаг 2: запустить** `npm run test:it -- tests/it/test-folder-access.it.test.ts`, ожидается FAIL (методов нет).
- [ ] **Шаг 3: реализовать методы** в репозиториях и делегаты в `server/storage.ts` (контракт `IStorage` рядом со
  строкой 233 и делегаты рядом со строкой 928).
- [ ] **Шаг 4: запустить тот же тест**, ожидается PASS.
- [ ] **Шаг 5: `npm run check`**, ожидается без ошибок.

---

### Задача 4: серверный резолвер

**Файлы:**

- Создать: `server/services/test-folder-access.ts`
- Тест: `tests/access/test-folder-access.test.ts` (хранилище мокается, как в `tests/access/test-access.test.ts`)

Интерфейс сервиса:

```ts
/**
 * @module server/services/test-folder-access
 * @description Server side of folder access inheritance for tests: loads the folder tree and grants and applies
 * the pure rules of `@shared/access`.
 */
import { ancestorChain, folderRightsOf, visibleFolderMap, type FolderNode, type FolderRights,
  type FolderVisibility } from "@shared/access";
import { storage } from "../storage";

/** Rights of `userId` on the content of the folder `folderId` (`null` = root: no inherited rights). */
export async function folderRights(userId: string, folderId: string | null): Promise<FolderRights> {
  const nodes = await loadNodes();
  const grants = await storage.getTestFolderGrants();
  return folderRightsOf(ancestorChain(folderId, nodes), grants, userId);
}

/** Rights on the folder of a given test. Looks the folder up when the caller has only the test id. */
export async function folderRightsForTest(
  userId: string, test: { id: string; folderId?: string | null },
): Promise<FolderRights> {
  const folderId = test.folderId !== undefined ? test.folderId : await storage.getTestFolderIdOfTest(test.id);
  return folderRights(userId, folderId ?? null);
}

/** Ids of tests inside folders where the user holds `levels` rights (for list scope). */
export async function testIdsByFolderRights(
  userId: string, levels: ReadonlySet<"edit" | "assign" | "review">,
): Promise<string[]> { /* see Step 3 */ }

/** The user's folder tree with direct/transit marks. */
export async function visibleTestFolders(
  userId: string, levels: ReadonlySet<"edit" | "assign" | "review">, accessibleTestIds: ReadonlySet<string>,
): Promise<Map<string, FolderVisibility>> { /* see Step 3 */ }
```

`loadNodes()` строит `Map<string, FolderNode>` из `storage.getTestFolders()` (поля `id`, `parentId`, `ownerId`).

- [ ] **Шаг 1: написать падающие тесты** на: права по цепочке через мок хранилища; `folderRightsForTest` не читает
  папку из хранилища, если `folderId` передан; `testIdsByFolderRights` отдаёт тесты всего поддерева (грант на
  родителя виден в тестах вложенной папки); `visibleTestFolders` скрывает пустую папку без прав.
- [ ] **Шаг 2: запустить** `npm test -- tests/access/test-folder-access.test.ts`, ожидается FAIL.
- [ ] **Шаг 3: реализовать.** `testIdsByFolderRights`: для каждой папки считать `folderRightsOf` по её цепочке,
  собрать id папок, где есть право нужного уровня, взять `storage.getTestIdsInFolders`. `visibleTestFolders`:
  `storage.getFolderIdsOfTests([...accessibleTestIds])` -> множество непустых `folderId` -> `visibleFolderMap`.
- [ ] **Шаг 4: запустить тест**, ожидается PASS.

---

### Задача 5: подключение к `test-access.ts`

**Файлы:**

- Изменить: `server/services/test-access.ts`
- Изменить: `tests/access/test-access.test.ts` (заглушка нового сервиса)
- Тест: добавить случаи в `tests/access/test-folder-access.test.ts`

Правило: во всех проверках папочное право ДОПОЛНЯЕТ существующие ветки (объединение), ничего не отнимает.

- `TestRef` расширить необязательным `folderId?: string | null`.
- `canEditTest`: после веток владельца и гранта вернуть `(await folderRightsForTest(userId, test)).edit`.
- `canAssignTest`: после веток `assign`/`edit` гранта вернуть `.assign` (внутри ветки менеджера, как сейчас).
- `canReviewTest`: после гранта `review` вернуть `.review`.
- `canDeleteTest`: владелец теста или `.owner` папки (только при авторской роли).
- `readableTestScope`: к `ids` добавить `testIdsByFolderRights(userId, levels)`, где `levels` = `{edit}` для автора и
  `{edit, assign}` для менеджера; `wantsAuthor || wantsManager` условие сохраняется.

- [ ] **Шаг 1: заглушка в существующих тестах.** В `tests/access/test-access.test.ts` рядом с `vi.mock` хранилища
  добавить, чтобы старые тесты не ходили в хранилище за папками:

```ts
vi.mock("../../server/services/test-folder-access", () => ({
  folderRightsForTest: vi.fn(async () => ({ owner: false, edit: false, assign: false, review: false })),
  testIdsByFolderRights: vi.fn(async () => []),
}));
```

- [ ] **Шаг 2: написать падающие тесты** в `tests/access/test-folder-access.test.ts` (с реальным сервисом папок и
  моками хранилища): автор без гранта на тест, но с `edit` на папке теста, проходит `canEditTest`; менеджер с
  `assign` на папке проходит `canAssignTest`, но не `canEditTest`; автор с `edit` на родительской папке получает
  тест вложенной папки в `readableTestScope`; владелец папки может `canDeleteTest`; автор без прав не проходит
  ни одну проверку (регрессия на объединение: прямой грант на тест по-прежнему работает без папочных прав).
- [ ] **Шаг 3: запустить, ожидается FAIL; реализовать правку; запустить, ожидается PASS.** Затем
  `npm test -- tests/access` целиком: старые тесты должны остаться зелёными.

---

### Задача 6: маршруты папок

**Файлы:**

- Изменить: `server/routes/test-folders.ts`
- Тест: `tests/access/test-folder-routes.test.ts`

Изменения по маршрутам:

- `GET /`: администратор и суперпользователь получают все папки с `visibility: "direct"`. Остальным: взять
  `readableTestScope`, затем `visibleTestFolders`, вернуть только папки из карты, добавив поля `visibility` и
  `canEdit` (право `edit` на папке). Старые поля папки не меняются, поэтому клиент не ломается.
- `POST /`: `parentId` задан -> требуется `folderRights(...).edit`, иначе `403`. В корне как сейчас.
- `PUT /:id`: требуется `edit` на самой папке; при смене `parentId` дополнительно `edit` на новом родителе и
  перенос по задаче 7.
- `DELETE /:id`: `folder-only` требует `edit`, `folder-and-tests` требует владельца папки или администратора.
- `PATCH /move/:testId`: требуется `canEditTest` на тесте и `edit` на папке назначения (корень разрешён); логика
  расширения доступа по задаче 7.
- Новые: `GET /:id/access`, `PUT /:id/access` (тело `{ userId, accessLevel }`), `DELETE /:id/access/:userId/:slot`
  (`slot` равен `work` или `review`). Только владелец папки или администратор.

- [ ] **Шаг 1: написать падающие тесты маршрутов** (супертест по образцу `tests/review-routes.test.ts`): автор без
  прав получает в списке только транзитные папки с доступным тестом; пустая чужая папка не возвращается; создание
  папки внутри чужой даёт 403; грант может выдать только владелец папки; администратор видит всё.
- [ ] **Шаг 2: запустить**, ожидается FAIL.
- [ ] **Шаг 3: реализовать маршруты.** Хелпер `requireFolderRight(level)` держать в самом файле маршрутов, он
  вызывает `folderRights` и отвечает `403 {error: "forbidden"}`.
- [ ] **Шаг 4: запустить**, ожидается PASS; `npm test -- tests/access` зелёный.

---

### Задача 7: перенос с сохранением прав и превью

**Файлы:**

- Создать: `server/services/test-folder-transfer.ts`
- Изменить: `server/routes/test-folders.ts`
- Тест: добавить в `tests/it/test-folder-access.it.test.ts` и `tests/access/test-folder-routes.test.ts`

Правило (из спецификации): при переносе элемента его унаследованные от старой цепочки права копируются ему прямыми
грантами, затем он переезжает. Для расширения доступа считается множество людей.

Интерфейс:

```ts
/** What a move does to access, before it happens. */
export interface MovePlan {
  /** Grants to copy onto the moved item: inherited from the old chain, not yet held directly. */
  materialize: Array<{ userId: string; accessLevel: "edit" | "assign" | "review" }>;
  /** Users who see the item after the move but do not see it now. */
  gainedUserIds: string[];
}

/** Plans the move of a test or of a folder into `destFolderId` (`null` = root). */
export async function planMove(
  subject: { kind: "test"; id: string } | { kind: "folder"; id: string },
  destFolderId: string | null,
): Promise<MovePlan>;

/** Copies the inherited grants onto the subject; idempotent, additive only. */
export async function materializeInheritedGrants(
  subject: { kind: "test"; id: string } | { kind: "folder"; id: string },
  plan: MovePlan,
  actorId: string,
): Promise<void>;
```

Вычисление `planMove`: «старый» состав равен владельцам и грантам старой цепочки (для папки цепочка начинается с
её родителя, свои гранты папки не материализуются) плюс прямые гранты и владелец самого элемента. `materialize`
берёт гранты и владельцев старой цепочки (владелец папки превращается в `edit`), которых у элемента нет прямым
грантом такого же или более высокого уровня. `gainedUserIds` равен людям с правами по цепочке назначения минус
«старый» состав. Запись в слот: рабочий грант не понижается (`edit` не заменяется на `assign`).

Подключение:

- `PATCH /move/:testId` и `PUT /:id` (смена `parentId`): считать `planMove`; при `gainedUserIds.length > 0` и
  отсутствии `confirmGain: true` в теле ответить `409 {error: "access_gain", gained: N}`; иначе
  `materializeInheritedGrants`, затем перенос.
- Новый `POST /move-preview` (тело `{ kind, id, destFolderId }`) возвращает `{ gained: N }` без побочных эффектов.
- `DELETE /:id` в режиме `folder-only`: перед удалением применить `materializeInheritedGrants` ко всем прямым
  тестам и дочерним папкам удаляемой папки (они переезжают в `moveTestsTo`), расширения доступа здесь не
  блокируют, но сообщаются в ответе полем `gained`.

- [ ] **Шаг 1: написать падающие тесты.** Интеграционные: перенос теста из папки с грантом `edit` пользователю U в
  корень оставляет U прямой грант `edit` на тесте; повторное применение не плодит строк; рабочий грант не
  понижается; перенос в папку с чужими грантами даёт `gainedUserIds` с этими людьми. Маршрутные: перенос с
  расширением без `confirmGain` отвечает 409, с `confirmGain` проходит; превью ничего не пишет.
- [ ] **Шаг 2: запустить**, ожидается FAIL.
- [ ] **Шаг 3: реализовать** сервис и подключение.
- [ ] **Шаг 4: запустить** `npm run test:it -- tests/it/test-folder-access.it.test.ts` и
  `npm test -- tests/access`, ожидается PASS.

---

### Задача 8: итоговая проверка

- [ ] **Шаг 1:** `npm run check`, ожидается без ошибок.
- [ ] **Шаг 2:** `npm test -- tests/access shared/access`, ожидается PASS.
- [ ] **Шаг 3:** `npm run test:it -- tests/it/test-folder-access.it.test.ts`, ожидается PASS.
- [ ] **Шаг 4:** полный прогон НЕ запускать без разрешения владельца (правило проекта). Сообщить, что `test:cov` не
  запускался.
- [ ] **Шаг 5:** `npm run dev` поднимет миграцию автоматически (она добавляющая). Проверить вручную в БД, что
  `test_folders.owner_id` заполнен у папок с `created_by`.
- [ ] **Шаг 6:** обновить документацию по правилу из CLAUDE.md: спецификации доступа (`docs/specs/`), список таблиц и
  раздел «Authentication» в `CLAUDE.md`, мапу API папок. Коммит и пуш только по явному разрешению владельца.

## Самопроверка плана по спецификации

- Модель «объединение»: задачи 1, 5.
- Раздельные деревья, уровни как у элементов: схема задачи 2 только для тестов; ось тем отложена в план 3.
- Видимость (путь к доступному, скрытые пустые, свежая пустая папка у владельца): задачи 1, 4, 6.
- Перенос сохраняет права и предупреждение о расширении: задача 7.
- Отзыв грантов с подсчётом зависимых тестов: НЕ покрыт планом 1 для папок тестов. Для тестов в этой оси зависимости
  нет (инвариант доставки: путь выдачи права не проверяет), поэтому отдельный подсчёт нужен только для тем и
  входит в план 3.
- Инвариант доставки PRD-15: маршруты выдачи и оценки не трогаются.
- Данные: миграция добавляющая, бэкфилл `owner_id` из `created_by`: задача 2.
