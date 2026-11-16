# Права на папки тестов: план 2 (интерфейс и доработки сервера)

> **Для исполнителя:** используйте superpowers:executing-plans. Субагенты в проекте запрещены. Шаги отмечены
> флажками `- [ ]`.

**Цель:** интерфейс прав на папки тестов по согласованному эскизу и серверные правки, которые появились при его
согласовании. После плана 2 планы 1 и 2 выпускаются вместе.

**Архитектура:** сервер плана 1 (ветка `feat/test-folder-access`) остаётся основой. Уровень `review` уходит с папок
целиком: из схемы, миграции `0066`, чистого модуля и маршрутов. Новые ответы сервера (унаследованное у теста,
список людей в превью переноса, пользователи для окна доступа папки, смена владельца) строятся на одной чистой
функции `inheritedAccess` в `shared/access/folder-inheritance.ts`. Клиент получает окно `FolderAccessPanel` по
образцу `TestAccessPanel`, неактивные пункты меню папки, раздел «Унаследовано» у теста и предупреждение в окне
переноса.

**Стек:** TypeScript, React 19, `@skillum/ui-kit`, React Query, Express, Drizzle, Vitest, pglite. Новых зависимостей
нет.

**Источники:**

- спецификация [2026-11-16-folder-access-inheritance-design.md](../specs/2026-11-16-folder-access-inheritance-design.md),
  раздел «Эскизы: состояния»;
- эскиз [approved/test-folder-access.html](../wireframes/approved/test-folder-access.html);
- план 1 [PLAN_test_folder_access_backend.md](PLAN_test_folder_access_backend.md).

## Статус исполнения (2026-11-16)

Задачи 1-11 выполнены в ветке `feat/test-folder-access`, задача 12 частично. Отступления:

- Выбор папки для тестов при удалении «только папку» — плоский `Select`, а не дерево: папка
  без права в нём неактивный пункт списка (`disabled` у варианта), а не узел дерева.
- Ответ `GET /api/tests/:id/access` получил `inherited` и в наборе
  `tests/routes.tests.coverage.test.ts`; заглушка `tests/helpers/no-folder-rights.ts` отдаёт
  `loadTestFolderNodes` как `vi.fn`, чтобы набор мог задать цепочку на один случай.
- Окно переноса закрывается после успешного ответа, а не по клику; ответ `409` оставляет его
  открытым со списком людей.

Не выполнено: приёмка в браузере (шаг 12.4) — dev-БД на `localhost:55432` недоступна, Docker
не запущен, миграция `0066` не применена. Полный `npm test` не запускался (нужно разрешение).

## Решения при согласовании эскиза (2026-11-16)

1. У транзитной папки меню есть, все пункты неактивны. У своей папки пункт неактивен, если на него нет права
   (`canEdit` для «Переименовать» и «Удалить папку...», `canManageAccess` для «Общий доступ»).
2. Рецензирование выдаётся только на конкретный тест. На папку уровня `review` нет. Это отменяет решение 4 плана 1
   («грант `review` на папке даёт рецензирование всех тестов внутри»). `edit` на папке по-прежнему даёт
   рецензирование тестов внутри, как `edit` на тесте.
3. Смена владельца папки нужна. Право то же, что у теста: `tests.owner.change`.
4. Предупреждение при переносе показывает число и список людей с уровнем. Больше 10 человек: первые 10 и
   «и ещё N».

## Решения плана сверх эскиза

Эскиз этих мест не рисует. План принимает их так; при несогласии поправить до начала работы.

1. **Выбор папки назначения.** В выборе папки (перенос теста, новый тест, папка для тестов удаляемой папки) папки
   без `canEdit` остаются в дереве, но неактивны: сервер всё равно ответит `403`. Это продолжение решения 1.
2. **Унаследованные строки.** Владелец папки выше по цепочке показывается в разделе «Унаследовано» с уровнем
   «Редактирование»: у него все права, а это высший уровень, который выводит панель. Если человек получает доступ
   от нескольких папок, выводится самый сильный уровень, а при равенстве ближайшая папка. Владелец самого теста или
   папки в разделе не выводится.
3. **Новый тест в папке** (`POST /api/tests` с `folderId`) требует `edit` на папке, иначе `403`. Закрывает открытый
   пункт плана 1.
4. **Импорт книги в папку.** Путь «Папка / Подпапка» сопоставляется только с папками, где у автора есть `edit`
   (администратору со всеми). Совпадение по имени с папкой без права не используется: импорт пишет ошибку «Нет
   прав на папку «X»» и папку теста не меняет. Если импорт переносит существующий тест в другую папку,
   унаследованные права копируются на тест, как при переносе; расширение доступа не блокирует импорт, а попадает в
   предупреждения результата. Подтверждением служит сам импорт, как удаление папки «только папка» в плане 1.
5. **Миграция `0066` пересобирается**, а не дополняется новой: она нигде не применена (dev-БД на момент плана 1
   была недоступна, ветка не влита). Перед пересборкой это проверяется (задача 1, шаг 1).

## Границы плана

Входит: задачи 1-12 ниже. Не входит: ось тем (план 3), группы как получатели грантов, перенос папки целиком
через интерфейс (в списке тестов его нет и сейчас).

## Карта файлов

Сервер и общий код:

- Изменить `shared/schema.ts`: уровни грантов папки `edit` и `assign`, один уникальный индекс.
- Пересобрать `drizzle/0066_test_folder_access.sql` и `drizzle/meta/0066_snapshot.json`, поправить
  `drizzle/meta/_journal.json`; переэкспортировать `tests/it/schema.sql`.
- Изменить `shared/access/folder-inheritance.ts`: без `review`, новая функция `inheritedAccess`.
- Изменить `server/storage/access-repository.ts` и `server/storage.ts`: грант папки без слотов.
- Изменить `server/services/test-folder-transfer.ts`: без слота `review`, `gained` со списком и уровнем.
- Изменить `server/services/test-access.ts`: комментарий к `canReviewTest`.
- Изменить `server/routes/test-folders.ts`: уровни, отзыв без слота, превью со списком, `inherited` через
  `inheritedAccess`, `GET /:id/access/users`, `PATCH /:id/owner`.
- Изменить `server/routes/tests.ts`: `inherited` в `GET /:id/access`, проверка папки в `POST /`.
- Изменить `server/services/workbook-import.ts`: права на папку при импорте.
- Тесты: `shared/access/__tests__/folder-inheritance.test.ts`, `tests/access/test-folder-access.test.ts`,
  `tests/access/test-folder-routes.test.ts`, `tests/it/test-folder-access.it.test.ts`, тесты `tests.ts` и импорта
  книги (задачи 5 и 6 называют файлы).

Клиент:

- Изменить `client/src/styles/tb-tests-list.css`: неактивный пункт меню.
- Изменить `client/src/features/tests/list/tests-list.types.ts`: права в `FolderEntry`.
- Изменить `client/src/features/tests/list/tests-list.tsx`: меню папки, окно доступа папки, выбор папки, перенос.
- Изменить `client/src/components/folder-tree-select.tsx`: неактивные папки.
- Создать `client/src/features/tests/access/folder-access-panel.tsx`: окно «Общий доступ» папки.
- Создать `client/src/features/tests/access/access-people.ts`: общие `displayName`, `initials`, `AccessUser`,
  `LEVEL_OPTIONS`, `levelLabel` (вынести из `test-access-panel.tsx`).
- Создать `client/src/features/tests/access/inherited-access-table.tsx`: таблица «Унаследовано», общая для теста и
  папки.
- Изменить `client/src/features/tests/access/test-access-panel.tsx`: раздел «Унаследовано».
- Создать `client/src/features/tests/list/move-gain-banner.tsx`: предупреждение о расширении доступа.
- Тесты: `client/src/features/tests/access/__tests__/folder-access-panel.test.tsx` (новый),
  `.../__tests__/test-access-panel.test.tsx`, `client/src/features/tests/list/__tests__/tests-list.test.tsx`,
  `client/src/components/__tests__/folder-tree-select.test.tsx` (создать, если нет).
- Эскиз `docs/wireframes/approved/test-folder-access.html`: убрать временную копию правила неактивного пункта.

## Задача 1. Папкам убрать уровень `review` (схема и миграция)

**Файлы:** `shared/schema.ts`, `drizzle/0066_test_folder_access.sql`, `drizzle/meta/0066_snapshot.json`,
`drizzle/meta/_journal.json`, `tests/it/schema.sql`.

- [ ] **Шаг 1. Убедиться, что `0066` нигде не применена.** Ветка не влита в `main`
  (`git branch -r --contains bfa0c632` пусто). На dev-БД из `.env`, если она поднята:
  `SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 3;` — записи с `when`
  из журнала для `0066` нет и таблицы `test_folder_access_grants` нет. Если миграция всё же применена, остановиться:
  пересборка запрещена, вместо неё нужна новая миграция `0067` (сообщить владельцу).
- [ ] **Шаг 2. Схема.** В `testFolderAccessGrants` заменить уровни и индексы:

  ```ts
  export const testFolderAccessGrants = pgTable("test_folder_access_grants", {
    id: varchar("id", { length: 36 }).primaryKey(),
    folderId: varchar("folder_id", { length: 36 }).notNull()
      .references(() => testFolders.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).notNull(),
    // Review is granted on a specific test only, never on a folder (owner decision 2026-11-16).
    accessLevel: text("access_level", { enum: ["edit", "assign"] }).notNull(),
    grantedBy: varchar("granted_by", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  }, (table) => ({
    userIdx: uniqueIndex("test_folder_access_grants_user_idx").on(table.folderId, table.userId),
  }));
  ```

  Типы колонок взять из текущего определения как есть, менять только `accessLevel` и индексы. JSDoc таблицы:
  убрать упоминание двух слотов.
- [ ] **Шаг 3. Пересобрать миграцию.** Удалить `drizzle/0066_test_folder_access.sql` и
  `drizzle/meta/0066_snapshot.json`, убрать запись `0066` из `drizzle/meta/_journal.json`. Затем
  `node node_modules/drizzle-kit/bin.cjs generate --name=test_folder_access` с фиктивным `DATABASE_URL`, как в
  плане 1. Ожидается новый `0066_test_folder_access.sql` с одной таблицей, колонкой `owner_id`, внешним ключом и
  одним уникальным индексом.
- [ ] **Шаг 4. Вернуть бэкфилл** в конец SQL-файла:

  ```sql
  --> statement-breakpoint
  UPDATE "test_folders" SET "owner_id" = "created_by" WHERE "owner_id" IS NULL AND "created_by" IS NOT NULL;
  ```

- [ ] **Шаг 5. Схема pglite.** Переэкспортировать `tests/it/schema.sql` тем же способом, что в плане 1 (сохранить
  CRLF), сверить `git diff`: меняется только таблица грантов папки.
- [ ] **Шаг 6.** `npm run check`. Ожидаются ошибки типов в местах, где ещё упоминается `review` для папок; их
  снимают задачи 2-4.

## Задача 2. Чистый модуль: без `review` и функция `inheritedAccess`

**Файлы:** `shared/access/folder-inheritance.ts`, `shared/access/__tests__/folder-inheritance.test.ts`.

- [ ] **Шаг 1. Тесты `inheritedAccess`** (добавить в существующий файл):

  ```ts
  describe("inheritedAccess", () => {
    const nodes = new Map<string, FolderNode>([
      ["top", { id: "top", parentId: null, ownerId: "o-top" }],
      ["mid", { id: "mid", parentId: "top", ownerId: null }],
      ["leaf", { id: "leaf", parentId: "mid", ownerId: "o-leaf" }],
    ]);
    const chain = ancestorChain("mid", nodes); // mid, top

    it("lists grants and owners of the chain, owners as edit", () => {
      const grants: FolderGrant[] = [{ folderId: "mid", userId: "u1", accessLevel: "assign" }];
      expect(inheritedAccess(chain, grants, new Set())).toEqual([
        { userId: "u1", accessLevel: "assign", folderId: "mid" },
        { userId: "o-top", accessLevel: "edit", folderId: "top" },
      ]);
    });

    it("keeps the strongest level, the nearest folder on a tie", () => {
      const grants: FolderGrant[] = [
        { folderId: "mid", userId: "u1", accessLevel: "assign" },
        { folderId: "top", userId: "u1", accessLevel: "edit" },
        { folderId: "mid", userId: "u2", accessLevel: "assign" },
        { folderId: "top", userId: "u2", accessLevel: "assign" },
      ];
      const rows = inheritedAccess(chain, grants, new Set(["o-top"]));
      expect(rows).toEqual([
        { userId: "u1", accessLevel: "edit", folderId: "top" },
        { userId: "u2", accessLevel: "assign", folderId: "mid" },
      ]);
    });

    it("skips excluded users and ignores folders outside the chain", () => {
      const grants: FolderGrant[] = [{ folderId: "leaf", userId: "u3", accessLevel: "edit" }];
      expect(inheritedAccess(chain, grants, new Set(["o-top"]))).toEqual([]);
    });
  });
  ```

  В тестах `folderRightsOf` и `visibleFolderMap` убрать случаи с `review`; добавить проверку «`edit` даёт
  `review`», если её нет.
- [ ] **Шаг 2.** `npm test -- shared/access/__tests__/folder-inheritance.test.ts`: падает, `inheritedAccess` нет.
- [ ] **Шаг 3. Реализация.** `FolderAccessLevel = "edit" | "assign"`. В `folderRightsOf` поле `review` остаётся и
  равно `edit` (комментарий: рецензирование папкой не выдаётся, его даёт только `edit`). Новая функция:

  ```ts
  /** One row of inherited access: who reaches the item through which folder. */
  export interface InheritedAccess {
    userId: string;
    accessLevel: FolderAccessLevel;
    /** The folder the access comes from; the nearest one when several give the same level. */
    folderId: string;
  }

  const LEVEL_RANK: Record<FolderAccessLevel, number> = { assign: 1, edit: 2 };

  /**
   * People who reach the content of `chain` through its folders: grants on the
   * chain plus the owners of chain folders (counted as `edit`). One row per user
   * with the strongest level; on a tie the nearest folder wins.
   *
   * @param chain - Result of {@link ancestorChain}, nearest folder first.
   * @param grants - Folder grants; those on other folders are ignored.
   * @param exclude - Users not to list (the item's own owner).
   * @returns Rows in the order users were first met along the chain.
   */
  export function inheritedAccess(
    chain: readonly FolderNode[],
    grants: readonly FolderGrant[],
    exclude: ReadonlySet<string>,
  ): InheritedAccess[] {
    const byUser = new Map<string, InheritedAccess>();
    const offer = (userId: string, accessLevel: FolderAccessLevel, folderId: string) => {
      if (exclude.has(userId)) return;
      const current = byUser.get(userId);
      if (!current || LEVEL_RANK[accessLevel] > LEVEL_RANK[current.accessLevel]) {
        byUser.set(userId, { userId, accessLevel, folderId });
      }
    };
    for (const node of chain) {
      for (const g of grants) if (g.folderId === node.id) offer(g.userId, g.accessLevel, node.id);
      if (node.ownerId) offer(node.ownerId, "edit", node.id);
    }
    return [...byUser.values()];
  }
  ```

  Порядок в первом тесте: `u1` встречается раньше `o-top`, потому что `mid` ближе. Во втором тесте `u1` получает
  `edit` от `top`: строка заменяется, но `Map` сохраняет место первой встречи.
- [ ] **Шаг 4.** Тест модуля зелёный.

## Задача 3. Хранилище и перенос без слота `review`

**Файлы:** `server/storage/access-repository.ts`, `server/storage.ts`, `server/services/test-folder-transfer.ts`,
`tests/it/test-folder-access.it.test.ts`, `tests/access/test-folder-access.test.ts`.

- [ ] **Шаг 1. Тесты.** В `tests/it/test-folder-access.it.test.ts` заменить случаи двух слотов одним: повторный
  `upsertTestFolderGrant` того же пользователя меняет уровень, строка одна; `removeTestFolderGrant(folderId, userId)`
  удаляет её и отвечает `true`, повторно `false`. Для `planMove` добавить: `gained` содержит
  `{ userId, accessLevel }` с самым сильным уровнем цепочки назначения; пользователь, у которого на тесте только
  грант `review`, при переносе в папку с его `assign` попадает в `gained`.
- [ ] **Шаг 2.** `npm run test:it -- tests/it/test-folder-access.it.test.ts`: падает.
- [ ] **Шаг 3. Хранилище.** `upsertTestFolderGrant` без `targetWhere`:

  ```ts
  /** Writes the single grant of a user on a folder; a second write changes its level. */
  async upsertTestFolderGrant(grant: InsertTestFolderAccessGrant): Promise<TestFolderAccessGrant> {
    const [row] = await db.insert(testFolderAccessGrants).values({
      id: randomUUID(),
      folderId: grant.folderId,
      userId: grant.userId,
      accessLevel: grant.accessLevel,
      grantedBy: grant.grantedBy ?? null,
      createdAt: new Date(),
    }).onConflictDoUpdate({
      target: [testFolderAccessGrants.folderId, testFolderAccessGrants.userId],
      set: { accessLevel: grant.accessLevel, grantedBy: grant.grantedBy ?? null },
    }).returning();
    return row;
  }

  /** Removes the grant of a user on a folder. */
  async removeTestFolderGrant(folderId: string, userId: string): Promise<boolean> {
    const result = await db.delete(testFolderAccessGrants)
      .where(and(eq(testFolderAccessGrants.folderId, folderId), eq(testFolderAccessGrants.userId, userId)))
      .returning({ id: testFolderAccessGrants.id });
    return result.length > 0;
  }
  ```

  В `server/storage.ts` поправить сигнатуру в `IStorage` и делегат.
- [ ] **Шаг 4. Перенос.** В `test-folder-transfer.ts`:
  - `MovePlan.gainedUserIds` заменить на `gained: MaterializedGrant[]`;
  - в `loadSubject` прямые гранты теста брать без `review`: рецензент теста не считается его аудиторией для
    рабочего доступа, а его грант `review` перенос не трогает;
  - убрать `slotOf`, `strongest` упростить до одного уровня на пользователя (ранг `assign` < `edit`);
  - убрать ветку материализации `review`;
  - `gained` строить по самому сильному уровню цепочки назначения:

  ```ts
  const destination = strongest(chainEntries(ancestorChain(destFolderId, nodes), grants));
  const gained = [...destination]
    .filter(([userId]) => !audience.has(userId))
    .map(([userId, accessLevel]) => ({ userId, accessLevel }));
  return { materialize, gained };
  ```

  Здесь `strongest` возвращает `Map<string, FolderAccessLevel>`.
- [ ] **Шаг 5.** В `tests/access/test-folder-access.test.ts` убрать проверки `review`-гранта на папке; добавить
  «грант `edit` на папке даёт `canReviewTest`». В `server/services/test-access.ts` поправить комментарий у
  `canReviewTest`: рецензирование папкой даёт только `edit`.
- [ ] **Шаг 6.** Интеграционный и модульный тесты зелёные.

## Задача 4. Маршруты папок: уровни, превью со списком, владелец, пользователи

**Файлы:** `server/routes/test-folders.ts`, `tests/access/test-folder-routes.test.ts`.

- [ ] **Шаг 1. Тесты маршрутов** (стейтфул-мок плана 1):
  - `PUT /:id/access` с `accessLevel: "review"` отвечает `400 invalid_grant`;
  - `DELETE /:id/access/:userId` удаляет грант (`204`), чужой папки `403`, нет гранта `404`;
  - `POST /move-preview` отвечает `{ gained: [{ userId, name, accessLevel }] }`, имена из `getUser`;
  - перенос без `confirmGain` отвечает `409 { error: "access_gain", gained: [...] }` того же вида;
  - `GET /:id/access` отдаёт `inherited` как строки `inheritedAccess` с `folderName`, без владельца папки;
  - `GET /:id/access/users` для владельца папки отдаёт `[{ id, name, email, roles }]`, для автора без прав `403`;
  - `PATCH /:id/owner` с правом `tests.owner.change` меняет владельца; без права `403`; неизвестный пользователь
    `404`; `ownerId` не строка и не `null` — `400`.
- [ ] **Шаг 2.** `npm test -- tests/access/test-folder-routes.test.ts`: падает.
- [ ] **Шаг 3. Реализация.**
  - `LEVELS = ["edit", "assign"]`; в JSDoc модуля убрать `review` и описать новые маршруты.
  - Общий помощник имён для превью и `409`:

  ```ts
  /** Gained people with display names: the author may lack `users.read`, so the server names them. */
  async function namedGain(gained: readonly MaterializedGrant[]) {
    return Promise.all(gained.map(async (g) => {
      const user = await storage.getUser(g.userId);
      return { userId: g.userId, name: user?.name?.trim() || user?.email || null, accessLevel: g.accessLevel };
    }));
  }
  ```

  - `moveKeepingRights`: `if (plan.gained.length > 0 && req.body?.confirmGain !== true)` и ответ
    `{ error: "access_gain", gained: await namedGain(plan.gained) }`.
  - `POST /move-preview`: `res.json({ gained: await namedGain(plan.gained) })`.
  - `GET /:id/access`: цепочка предков через `ancestorChain(folder.parentId, nodes)` и
    `inheritedAccess(chain, grants, new Set(folder.ownerId ? [folder.ownerId] : []))`, каждой строке добавить
    `folderName` из узлов дерева.
  - `DELETE /:id/access/:userId` вместо `/:id/access/:userId/:slot`.
  - `GET /:id/access/users` под `canManageFolder`, тело как у `GET /api/tests/:id/access/users`.
  - `PATCH /:id/owner`:

  ```ts
  // PATCH /api/test-folders/:id/owner — change the folder owner; the same right as for a test.
  router.patch("/:id/owner", requirePermission("tests.owner.change"), async (req, res) => {
    try {
      const folder = await folderOr404(res, req.params.id);
      if (!folder) return;
      const { ownerId } = req.body ?? {};
      if (ownerId !== null && typeof ownerId !== "string") {
        return res.status(400).json({ error: "ownerId must be a string or null" });
      }
      if (ownerId && !(await storage.getUser(ownerId))) {
        return res.status(404).json({ error: "Owner user not found" });
      }
      await storage.setTestFolderOwner(folder.id, ownerId ?? null);
      res.json({ folderId: folder.id, ownerId: ownerId ?? null });
    } catch (error) {
      logger.error("Change test folder owner error: " + (error as Error).message);
      res.status(500).json({ error: "Failed to change folder owner" });
    }
  });
  ```

  Маршрут `PATCH /:id/owner` объявить раньше `PATCH /move/:testId` не обязательно: пути не пересекаются, но
  проверить, что `/move/...` не попадает в `/:id/owner` (у него другой суффикс).
- [ ] **Шаг 4.** Тест маршрутов зелёный.

## Задача 5. Тест: унаследованные права в ответе доступа и папка при создании

**Файлы:** `server/routes/tests.ts`; тесты — найти набор маршрутов доступа теста
(`grep -rl "/access\"" tests/ | grep -i test`) и набор создания теста (`grep -rl "post(\"/api/tests\")" tests/`).

- [ ] **Шаг 1. Тесты.**
  - `GET /api/tests/:id/access` у теста в папке отдаёт `inherited: [{ userId, accessLevel, folderId, folderName }]`
    без владельца теста; у теста в корне `inherited: []`.
  - `POST /api/tests` с `folderId` папки без `edit` у автора отвечает `403`; с правом создаёт тест; без `folderId`
    поведение прежнее.
- [ ] **Шаг 2.** Тесты падают.
- [ ] **Шаг 3. Реализация.** В `GET /:id/access` добавить к ответу:

  ```ts
  const nodes = await loadTestFolderNodes();
  const chain = ancestorChain(test.folderId ?? null, nodes);
  const names = new Map((await storage.getTestFolders()).map((f) => [f.id, f.name]));
  const inherited = inheritedAccess(chain, await storage.getTestFolderGrants(),
    new Set(test.ownerId ? [test.ownerId] : []))
    .map((row) => ({ ...row, folderName: names.get(row.folderId) ?? "" }));
  res.json({ testId: test.id, ownerId: test.ownerId ?? null, grants, inherited });
  ```

  В `POST /` после разбора тела, до записи: если `folderId` задан и вызывающий не администратор, проверить
  `(await folderRights(userId, folderId)).edit`, иначе `403 { error: "forbidden", field: "folderId" }`. Наборы
  маршрутов с заглушкой `no-folder-rights` получат отказ только там, где передают `folderId`; поправить их ожидания
  или мок по месту.
- [ ] **Шаг 4.** Тесты зелёные.

## Задача 6. Импорт книги: права на папку

**Файлы:** `server/services/workbook-import.ts`; тесты — найти набор `resolveFolderPath` / «Папка» в
`tests/` (`grep -rln "folderPath" tests/`).

- [ ] **Шаг 1. Тесты.**
  - путь совпадает по имени с папкой, где у автора нет `edit`: в `result.errors` строка «Нет прав на папку «X»»,
    `folderId` теста не меняется, новые папки не создаются;
  - путь ведёт в свою папку: тест переносится, унаследованные от старой папки гранты скопированы на тест;
  - перенос расширяет доступ: в предупреждениях результата строка «В новой папке доступ к тесту получат ещё N
    человек»;
  - администратор сопоставляется со всеми папками, как раньше.
- [ ] **Шаг 2.** Тесты падают.
- [ ] **Шаг 3. Реализация.** `resolveFolderPath(path, actor)` получает роли и id вызывающего. Кандидаты на
  совпадение — папки с `edit` (`folderRightsMap(actor.id)`), для администратора все. Если по имени нашлась только
  папка без права, функция возвращает `{ error: "Нет прав на папку «" + name + "»" }`; иначе
  `{ folderId }`. Создание недостающей папки внутри своей папки остаётся. Перед записью `folderId` существующего
  теста, когда папка меняется: `planMove({ kind: "test", id }, folderId)`, затем
  `materializeInheritedGrants(...)`, при непустом `gained` — предупреждение с числом (склонение «человек»: 1
  человек, 2-4 человека, 5 и больше человек).
- [ ] **Шаг 4.** Тесты зелёные. `npm run check` чистый.

## Задача 7. Неактивный пункт меню и права в списке папок (клиент)

**Файлы:** `client/src/styles/tb-tests-list.css`, `client/src/features/tests/list/tests-list.types.ts`,
`client/src/features/tests/list/tests-list.tsx`, `client/src/features/tests/list/__tests__/tests-list.test.tsx`,
`docs/wireframes/approved/test-folder-access.html`.

- [ ] **Шаг 1. Тесты** в `tests-list.test.tsx`:
  - папка с `canEdit: false, canManageAccess: false`: кнопка «Действия с папкой» есть, в меню «Переименовать»,
    «Общий доступ», «Удалить папку...» с атрибутом `disabled`, клик по ним ничего не открывает;
  - папка с `canEdit: true, canManageAccess: false`: «Общий доступ» неактивен, остальные активны;
  - папка с обоими правами: «Общий доступ» открывает окно с заголовком «Общий доступ» и описанием «Папка «X»».
- [ ] **Шаг 2.** Тесты падают.
- [ ] **Шаг 3. CSS.** В `tb-tests-list.css` после правил `.dropdown-item.danger`:

  ```css
  /* A menu item the reader has no right to: shown, not clickable (folder access, 2026-11-16). */
  .tb-tests-list .dropdown-item:disabled,
  .tb-tests-list .dropdown-item.danger:disabled {
    color: var(--ou-fg-disabled);
    cursor: not-allowed;
    background: none;
  }
  ```

  Удалить временную копию правила из `<style>` эскиза `approved/test-folder-access.html` вместе с её комментарием.
- [ ] **Шаг 4. Типы и данные.** `FolderEntry` получает
  `canEdit?: boolean; canManageAccess?: boolean; visibility?: "direct" | "transit"`; отсутствие поля значит
  «старый ответ» и трактуется как `true`. В `tests-list.tsx` маппинг `rawFolders` переносит эти поля;
  `renderFolderMenu` вызывается с полной записью папки (сейчас туда передаётся `parentId: null` и имя: заменить на
  `folders.find(...)`).
- [ ] **Шаг 5. Меню.** В `renderFolderMenu` каждый пункт получает `disabled={!allowed}`; добавить пункт «Общий
  доступ» (`KeyRound`, `data-testid={`folder-menu-access-${folder.id}`}`) между «Переименовать» и разделителем,
  клик открывает `FolderAccessPanel` (состояние `accessFolder`, задача 8).
- [ ] **Шаг 6.** Тесты зелёные.

## Задача 8. Окно «Общий доступ» папки

**Файлы:** создать `client/src/features/tests/access/access-people.ts`,
`client/src/features/tests/access/inherited-access-table.tsx`,
`client/src/features/tests/access/folder-access-panel.tsx`,
`client/src/features/tests/access/__tests__/folder-access-panel.test.tsx`; изменить `test-access-panel.tsx`.

- [ ] **Шаг 1. Вынести общее.** `access-people.ts`: `AccessUser`, `AccessLevel = "edit" | "assign"`,
  `LEVEL_OPTIONS`, `levelLabel(level)`, `displayName`, `initials` — перенести из `test-access-panel.tsx` без
  изменений поведения, панель теста импортирует их оттуда. Модульный JSDoc с `@module`.
- [ ] **Шаг 2. Таблица «Унаследовано».** `inherited-access-table.tsx`:

  ```tsx
  /**
   * @module features/tests/access/inherited-access-table
   *
   * Read-only «Унаследовано» section of the access panels: who reaches a test or a
   * folder through the folders above it. A row is removed only in its source
   * folder, so the folder cell links there when the reader may manage it.
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

  export function InheritedAccessTable(props: {
    rows: readonly InheritedRow[];
    usersById: ReadonlyMap<string, AccessUser>;
    /** Folder ids whose access panel the reader may open. */
    manageableFolderIds: ReadonlySet<string>;
    onOpenFolder: (folder: { id: string; name: string }) => void;
  }) {
    if (props.rows.length === 0) return null;
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
              render: (r) => props.manageableFolderIds.has(r.folderId) ? (
                <Button variant="ghost" size="s" onClick={() => props.onOpenFolder({ id: r.folderId, name: r.folderName })}>
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
  ```

- [ ] **Шаг 3. Тесты окна папки** (`folder-access-panel.test.tsx`, моки `fetch` как в `test-access-panel.test.tsx`):
  - заголовок «Общий доступ», описание «Папка «Инструктажи»», владелец по имени;
  - «Сменить владельца» есть при `can("tests.owner.change")` и отсутствует без него;
  - селект уровня предлагает только «Редактирование» и «Назначение»;
  - без грантов — заглушка «Доступ ещё никому не выдан»; без `inherited` раздела «Унаследовано» нет;
  - «Сохранить» шлёт `PATCH /owner` при смене владельца, `PUT /access` на новые и изменённые гранты,
    `DELETE /access/:userId` на снятые; после успеха тост «Доступ сохранён» и закрытие;
  - кнопка папки в «Унаследовано» вызывает `onOpenFolder`.
- [ ] **Шаг 4.** Тесты падают.
- [ ] **Шаг 5. Окно.** `folder-access-panel.tsx` повторяет `TestAccessPanel` по разметке и поведению (черновик до
  «Сохранить», `Drawer size="wide"`, `Combobox` + `Select` + «Добавить», `Table className="tb-tbl--menus"`,
  `EmptyState well` с `KeyRound`) с отличиями:
  - props: `folder: { id: string; name: string } | null`, `onClose`, `onOpenFolder`, `manageableFolderIds`;
  - описание `Папка «${folder.name}»`;
  - данные: `GET /api/test-folders/:id/access` (ключ `["/api/test-folders", id, "access"]`) и
    `GET /api/test-folders/:id/access/users`;
  - «Сменить владельца» выводится только при `can("tests.owner.change")` (`useAuth`), сохранение —
    `PATCH /api/test-folders/:id/owner`;
  - гранты — `PUT /api/test-folders/:id/access`, отзыв — `DELETE /api/test-folders/:id/access/:userId`;
  - после «Сохранить» сбросить кэш `["/api/test-folders"]`, `["/api/tests"]` и доступа этой папки;
  - под таблицей своих грантов `InheritedAccessTable` с `inherited` ответа.
  Модульный JSDoc с `@module`.
- [ ] **Шаг 6. Подключение.** В `tests-list.tsx` состояние `accessFolder`, рендер
  `<FolderAccessPanel folder={accessFolder} ... />` рядом с `TestAccessPanel`. `onOpenFolder` заменяет открытую
  папку на папку-источник. `manageableFolderIds` — папки с `canManageAccess !== false`.
- [ ] **Шаг 7.** Тесты окна и списка зелёные.

## Задача 9. Раздел «Унаследовано» в окне доступа теста

**Файлы:** `client/src/features/tests/access/test-access-panel.tsx`,
`client/src/features/tests/access/__tests__/test-access-panel.test.tsx`, `tests-list.tsx`.

- [ ] **Шаг 1. Тесты:** ответ с `inherited` показывает раздел с колонками «Пользователь / Уровень / Папка»; папка с
  правом управления — кнопка, клик вызывает `onOpenFolder`; без права — текст; без `inherited` или с пустым
  массивом раздела нет (старый ответ сервера тоже не ломает панель).
- [ ] **Шаг 2.** Тесты падают.
- [ ] **Шаг 3. Реализация.** `AccessResponse.inherited?: InheritedRow[]`; новые props `onOpenFolder` и
  `manageableFolderIds` (необязательные: без них кнопки выводятся текстом). Под секцией грантов
  `<InheritedAccessTable rows={access?.inherited ?? []} ... />`. В `tests-list.tsx` `onOpenFolder` закрывает окно
  теста и открывает окно папки.
- [ ] **Шаг 4.** Тесты зелёные.

## Задача 10. Выбор папки: неактивные папки без права

**Файлы:** `client/src/components/folder-tree-select.tsx`, тест компонента, `tests-list.tsx`.

- [ ] **Шаг 1. Тест компонента:** с `isDisabled={(id) => id === "f2"}` узел `f2` в дереве с `aria-disabled="true"`,
  клик по нему не вызывает `onChange`; корень всегда активен.
- [ ] **Шаг 2.** Тест падает.
- [ ] **Шаг 3. Реализация.** Необязательный prop `isDisabled?: (folderId: string) => boolean`; в `buildNodes`
  узлу ставится `disabled: isDisabled?.(f.id) ?? false` (`TreeNodeData.disabled` в ui-kit уже есть). JSDoc prop'а.
  В `tests-list.tsx` передать `isDisabled={(id) => folders.find((f) => f.id === id)?.canEdit === false}` в окна
  «Переместить в папку», «Новый тест» и в выбор папки для тестов при удалении «только папку».
- [ ] **Шаг 4.** Тесты зелёные.

## Задача 11. Перенос: предупреждение о расширении доступа

**Файлы:** создать `client/src/features/tests/list/move-gain-banner.tsx`; изменить `tests-list.tsx`
(`MoveFolderPickModal`, `moveMutation`); тесты в `tests-list.test.tsx`.

- [ ] **Шаг 1. Тесты:**
  - выбор папки запрашивает `POST /api/test-folders/move-preview` с `{ kind: "test", id, destFolderId }`;
  - при `gained` из трёх человек баннер с заголовком «В новой папке доступ к тесту получат ещё 3 человека» и
    текстом «Павел Сорокин (редактирование), Елена Кравцова (назначение), Анна Лебедева (назначение)»;
  - при 12 людях текст заканчивается «и ещё 2»; при одном — «получит ещё 1 человек»;
  - пустой `gained` — баннера нет; «Переместить» шлёт `PATCH` с `confirmGain: true`, только если баннер показан;
  - превью упало, сервер ответил на перенос `409 access_gain`: окно остаётся открытым, показывает баннер по
    `gained` из ответа, повторное «Переместить» шлёт `confirmGain: true`.
- [ ] **Шаг 2.** Тесты падают.
- [ ] **Шаг 3. Баннер.**

  ```tsx
  /**
   * @module features/tests/list/move-gain-banner
   *
   * Warning of the «Переместить в папку» dialog: the destination folder adds people
   * to the test. Shows the count in the title and the people with their level
   * (the first ten, then «и ещё N»).
   */
  import { Banner } from "@skillum/ui-kit";
  import { pluralize } from "@/lib/i18n";

  /** One person the move adds, as the server names them. */
  export interface GainedPerson {
    userId: string;
    name: string | null;
    accessLevel: "edit" | "assign";
  }

  const SHOWN = 10;
  const LEVEL: Record<GainedPerson["accessLevel"], string> = { edit: "редактирование", assign: "назначение" };

  export function MoveGainBanner({ gained }: { gained: readonly GainedPerson[] }) {
    if (gained.length === 0) return null;
    const n = gained.length;
    const title = `В новой папке доступ к тесту ${n === 1 ? "получит" : "получат"} ещё ${n} ${pluralize(n, "человек", "человека", "человек")}`;
    const names = gained.slice(0, SHOWN).map((p) => `${p.name ?? "—"} (${LEVEL[p.accessLevel]})`).join(", ");
    const rest = n > SHOWN ? `, и ещё ${n - SHOWN}` : "";
    return <Banner variant="subtle" tone="warning" title={title} description={names + rest} />;
  }
  ```

  Prop'ы `variant`, `tone`, `title`, `description` у `Banner` в ui-kit есть; в эскизе баннер
  `ou-banner--subtle ou-banner--warning`. `pluralize(count, one, few, many)` — из `client/src/lib/i18n.ts`.
- [ ] **Шаг 4. Окно переноса.** `MoveFolderPickModal` получает `testId` и `gained` извне; в `tests-list.tsx`
  `useQuery` превью по ключу `["/api/test-folders/move-preview", testId, selected]`, включён при
  `selected !== current`. Баннер под строкой «Текущая: …». `moveMutation` принимает `confirmGain`; в `onError`
  ответ `409 access_gain` кладёт `gained` в состояние окна и не закрывает его. Окно закрывается только при
  успехе переноса (сейчас закрывается сразу — поменять).
- [ ] **Шаг 5.** Тесты зелёные.

## Задача 12. Проверка, документы и приёмка

- [ ] **Шаг 1.** `npm run check` чистый.
- [ ] **Шаг 2.** Адресные прогоны: все изменённые и новые наборы задач 1-11 через `npm test -- <пути>` и
  `npm run test:it -- tests/it/test-folder-access.it.test.ts`.
- [ ] **Шаг 3.** Полный `npm test` — только с явного разрешения владельца. `test:cov` не запускать без отдельной
  просьбы.
- [ ] **Шаг 4. Приёмка в браузере (Playwright)** на dev-сервере этого worktree. Нужна поднятая dev-БД из `.env` и
  применённая миграция `0066` (`npm run db:migrate`). Сценарии по состояниям эскиза: список с транзитной папкой,
  меню своей и транзитной папки, окно доступа папки (выдать, сменить уровень, отозвать, сменить владельца под
  администратором), окно доступа теста с разделом «Унаследовано» и переходом в папку, перенос с предупреждением и
  списком. Скриншоты сверить с эскизом.
- [ ] **Шаг 5. Документы.**
  - `docs/specs/access-control/role-model.md`, раздел 6.4.1: убрать рецензирование папкой, добавить смену
    владельца папки и права при создании теста и импорте;
  - спецификация: в «Решения» и «Интерфейс» — решения плана сверх эскиза;
  - руководство автора (`docs/guides/`): раздел о правах на папки тестов — найти место рядом с описанием «Общего
    доступа» теста;
  - конкурентные анализы `docs/reports/ANALYSIS_*.md`: строка о наследовании прав от папок (правило CLAUDE.md,
    четвёртый слой документации; только наша сторона);
  - этот план: раздел «Статус исполнения» с отступлениями.
- [ ] **Шаг 6. Коммиты** по задачам — только с явного разрешения владельца, без `Co-Authored-By`.

## Порядок и риски

- Задачи 1-6 (сервер) идут раньше клиентских: клиент опирается на новые ответы.
- Пересборка `0066` безопасна только до первого применения (задача 1, шаг 1). Если dev-БД успели мигрировать
  старой версией, вместо пересборки — новая миграция `0067`, которая удаляет индекс слота `review` и сужает
  уровни.
- Наборы с заглушкой `tests/helpers/no-folder-rights.ts` могут потребовать правок после задачи 5 (проверка папки
  при создании теста).
