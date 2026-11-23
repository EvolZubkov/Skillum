# Флаг «Согласовано» у рецензентов: план реализации

> **Для исполнителя:** используйте superpowers:executing-plans (выполнение в этой же сессии, по задачам, с
> остановками на проверку). Субагенты запрещены владельцем проекта, поэтому subagent-driven-development не
> применяется. Шаги отмечены флажками `- [ ]`. Коммит делается только по явному разрешению владельца на коммит:
> шаги «Коммит» ниже подготавливают команду, а не разрешают её выполнить.

**Цель:** рецензент отмечает вопрос, раздел, экран или тест целиком как «Согласовано», у каждого рецензента своя
отметка с датой и временем; рецензент видит только свои отметки, автор видит всех; в окне рецензирования отметки
показаны бейджами на карте вопросов, в ящике редактора теста - вкладкой «Рецензирование» с рейлом «Согласование» и
«Комментарии».

**Архитектура:** новая таблица `test_review_approvals` и колонка `test_access_grants.accepted_at`; правило бейджа - чистый
модуль в `shared/review/` (одно на клиент и сервер); фильтр «рецензент видит только своё» - на сервере; бейджи на
точках карты ставит хост окна атрибутом `data-review-approved` и CSS, шаблон и контракт не меняются.

**Стек:** TypeScript, Drizzle ORM (миграция через `drizzle-kit generate`), Express, React 19 + `@skillum/ui-kit`,
React Query, Vitest (юнит), pglite (интеграционные). Новых зависимостей нет.

**Источники:** спека
[2026-11-23-review-approval-flag-design.md](../specs/2026-11-23-review-approval-flag-design.md), эскиз
[prd52-review-approval.html](../wireframes/approved/prd52-review-approval.html) (согласован 2026-11-23), карточки
состояний - раздел «Состав эскиза» спеки.

## Правила работы

- Работать в отдельном worktree от локального `main`: `git worktree add ../test-builder-review-approval -b
  feat/review-approval main`. `EnterWorktree` не использовать (ветвится от устаревшего `origin/main`). В worktree
  создать junction на `node_modules` главной копии, иначе клиентские тесты не запустятся.
- Тесты запускаются только целевыми файлами: `npm test -- <путь>`; интеграционные - `npm run test:it -- <путь>`.
  Полный прогон и `test:cov` без отдельного «да» владельца не запускать.
- UI реализуется узел за узлом из эскиза: перед каждой UI-задачей открыть эскиз, прочитать его разметку и CSS;
  задача закрывается только после поэлементной сверки скриншота с эскизом (задача 12).
- Тексты интерфейса - из эскиза дословно. Значки - только `lucide-react`. Компоненты - `@skillum/ui-kit`.

## Карта файлов

Создаются:

| Файл | Ответственность |
| --- | --- |
| `shared/review/approval-state.ts` | чистое правило бейджа и круга рецензентов |
| `shared/review/approval-state.test.ts` | юнит-тесты правила |
| `server/storage/review-approvals-repository.ts` | слой данных отметок |
| `tests/it/review-approvals-repository.it.test.ts` | интеграционные тесты слоя данных |
| `tests/review-approvals-routes.test.ts` | тесты маршрутов отметок |
| `client/src/features/tests/review/review-approval-api.ts` | клиентские запросы и типы |
| `client/src/features/tests/review/use-review-approvals.ts` | запрос и мутации отметок |
| `client/src/features/tests/review/review-approval-model.ts` | чистая подготовка данных: карточки, разделы, матрица |
| `client/src/features/tests/review/review-approval-card.tsx` | карточка «Тест в целом» / «Вопрос» |
| `client/src/features/tests/review/review-approval-block.tsx` | блок согласования в окне рецензирования |
| `client/src/features/tests/review/review-approval-summary.tsx` | сводка по разделам, фильтр, матрица (редактор) |
| `client/src/features/tests/review/review-tab.tsx` | вкладка «Рецензирование» редактора: рейл и два раздела |
| `client/src/features/tests/review/approval-marks.ts` | бейджи на точках карты и легенда в iframe |
| `client/src/features/tests/review/approval-marks.css` | стиль бейджа (источник правды) |
| `client/src/features/tests/review/use-approval-marks.ts` | хук: ставит бейджи после каждой перерисовки экрана |

Меняются: `shared/schema.ts`, `shared/review/anchor.ts`, `server/storage.ts`,
`server/storage/access-repository.ts`, `server/routes/review.ts`, `client/src/styles/tb-components.css`,
`client/src/features/tests/editor/sections/tab-rail.tsx`, `client/src/features/tests/editor/test-editor.tsx`,
`client/src/features/tests/review/review-panel.tsx`, `client/src/features/tests/debug-player/debug-player-page.tsx`,
`client/src/pages/review/review-player-page.tsx`, `tests/it/schema.sql`,
`server/__tests__/test-transfer-completeness.test.ts`, документы задачи 11.

## Задача 1. Схема, миграция, снимок схемы

**Файлы:** `shared/schema.ts`, `drizzle/0067_*.sql` (генерируется), `drizzle/meta/*`, `tests/it/schema.sql`,
`server/__tests__/test-transfer-completeness.test.ts`, спека.

Отступление от спеки: уникальность отметки держит обычный индекс по `anchor_key` (идентификатор объекта якоря или
пустая строка для экрана и теста), а не индекс по выражению с `coalesce`. Индекс остаётся в модели drizzle, и
`db:push` его не теряет. Спека правится в шаге 6.

- [ ] **Шаг 1. Добавить колонку `accepted_at` в `testAccessGrants`** (`shared/schema.ts`, после `grantedBy`):

```ts
  grantedBy: varchar("granted_by", { length: 36 }), // which admin granted it
  // PRD-52: когда держатель гранта `review` впервые открыл окно рецензирования этого теста. NULL у грантов
  // других уровней и у приглашений, которыми ещё не воспользовались; знаменатель «согласовали N из M» считается
  // по тем, у кого поле заполнено.
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
```

- [ ] **Шаг 2. Добавить таблицу отметок** (`shared/schema.ts`, сразу после типов `ReviewCommentStatus`):

```ts
/**
 * Отметка «Согласовано» (PRD-52, спека 2026-11-23-review-approval-flag-design). Принадлежит паре «рецензент -
 * объект», а не ветке комментария. Якорь - те же поля, что у комментария, плюс `anchorKey` для уникальности:
 * идентификатор вопроса, страницы или темы, пустая строка у экрана и теста целиком.
 */
export const testReviewApprovals = pgTable("test_review_approvals", {
  id: varchar("id", { length: 36 }).primaryKey(),
  testId: varchar("test_id", { length: 36 })
    .notNull()
    .references(() => tests.id, { onDelete: "cascade" }),
  reviewerId: varchar("reviewer_id", { length: 36 }).notNull(),
  anchorKind: text("anchor_kind", {
    enum: ["question", "content-page", "topic", "start", "results", "test"],
  }).notNull(),
  anchorKey: varchar("anchor_key", { length: 36 }).notNull().default(""),
  questionId: varchar("question_id", { length: 36 }),
  topicId: varchar("topic_id", { length: 36 }),
  contentPageId: uuid("content_page_id"),
  /** Снимок контекста строкой, как у комментария. */
  contextLabel: text("context_label"),
  /** Хеш содержимого якоря на момент отметки; NULL для экранов и теста в целом. */
  pinnedContentHash: text("pinned_content_hash"),
  approvedAt: timestamp("approved_at").notNull().defaultNow(),
}, (table) => ({
  // Один рецензент - одна отметка на объект.
  uniqueIdx: uniqueIndex("test_review_approvals_unique_idx")
    .on(table.testId, table.reviewerId, table.anchorKind, table.anchorKey),
  // Лента теста читается целиком.
  testIdx: index("test_review_approvals_test_idx").on(table.testId),
}));

/** Отметка «Согласовано», как её отдаёт база. */
export type TestReviewApproval = typeof testReviewApprovals.$inferSelect;

/** Отметка «Согласовано» на запись. */
export type InsertTestReviewApproval = typeof testReviewApprovals.$inferInsert;
```

- [ ] **Шаг 3. Сгенерировать миграцию** (не создавать SQL руками - `db:migrate` пропускает файлы вне журнала):

Run: `node_modules/.bin/drizzle-kit generate --name=review_approvals > $env:TEMP\gen.log 2>&1; Get-Content $env:TEMP\gen.log`

Expected: создан `drizzle/0067_review_approvals.sql`, обновлён `drizzle/meta/_journal.json`. Прочитать файл: в нём
ровно `CREATE TABLE "test_review_approvals"`, `ALTER TABLE "test_access_grants" ADD COLUMN "accepted_at"`, внешний
ключ на `tests` с `ON DELETE cascade` и два индекса. Деструктивных операторов быть не должно. Если номер занят
другой веткой - действовать по правилу из памяти проекта (смержить `main`, удалить свой файл и снимок, сгенерировать
заново).

- [ ] **Шаг 4. Применить миграцию к dev-БД и проверить:**

Run: `npm run db:migrate`

Expected: «migrations applied successfully». Проверка: `docker exec test-builder-db psql -U test_builder -d
test_builder -c "\d test_review_approvals"` показывает таблицу и индексы, `\d test_access_grants` - колонку
`accepted_at`. Dev-БД общая для всех worktree, а миграция аддитивная - это допустимо.

- [ ] **Шаг 5. Пересобрать снимок схемы pglite:**

```powershell
npx drizzle-kit export --sql | Where-Object { $_ -notmatch '^DATABASE_URL:' } | Set-Content -Encoding utf8 tests/it/schema.sql
```

Затем проверить `git diff --stat tests/it/schema.sql`: файл с окончаниями CRLF, и без обратной конвертации git покажет
переписанными все строки. Привести окончания к CRLF (`(Get-Content tests/it/schema.sql) -join "`r`n"`), сверить
диффом: добавлены только новая таблица, два индекса и колонка `accepted_at`. Файл обязан начинаться с `CREATE TABLE`.

- [ ] **Шаг 6. Перенос теста и спека.** В `server/__tests__/test-transfer-completeness.test.ts` в `NOT_CARRIED`
  добавить запись рядом с `test_review_comments`:

```ts
  test_review_approvals:
    "отметки «Согласовано» - оценка ЛЮДЕЙ этой инсталляции: рецензент, время и пин содержимого. На приёмнике " +
    "этих учётных записей нет, а пин сверяется с содержимым, которое там пересоздаётся (PRD-52).",
```

В спеке `docs/specs/2026-11-23-review-approval-flag-design.md` в разделе «Данные» заменить строку про индекс по
выражению `coalesce` на описание `anchor_key` (идентификатор объекта или пустая строка) и обычного уникального
индекса по `(test_id, reviewer_id, anchor_kind, anchor_key)`; убрать фразу про `db:push`.

- [ ] **Шаг 7. Проверить:**

Run: `npm test -- server/__tests__/test-transfer-completeness.test.ts tests/storage/schema-export-parity.test.ts`

Expected: PASS. Затем `npm run check`: ошибок типов нет.

- [ ] **Шаг 8. Коммит** (по разрешению): `git add shared/schema.ts drizzle tests/it/schema.sql
  server/__tests__/test-transfer-completeness.test.ts docs/specs` и `git commit -m "feat(review): таблица отметок
  «Согласовано» и accepted_at у грантов"`.

## Задача 2. Чистое правило бейджа и ключ якоря

**Файлы:** `shared/review/approval-state.ts`, `shared/review/approval-state.test.ts`, `shared/review/anchor.ts`.

Правило из спеки: у автора бейдж описывает круг рецензентов - `all` (все согласовали действующую редакцию), `part`
(часть), `stale` (отметки есть, но объект менялся после них у всех); у рецензента - только его собственная отметка:
`all` (согласовал), `stale` (объект изменён после его отметки). Круг - принявшие приглашение плюс все, кто поставил
отметку.

- [ ] **Шаг 1. Написать падающий тест** (`shared/review/approval-state.test.ts`):

```ts
/**
 * @module shared/review/approval-state.test
 * @description Правило бейджа «Согласовано» (PRD-52): один расчёт для клиента и тестов сервера.
 */
import { describe, it, expect } from "vitest";
import { anchorKeyOf } from "./anchor";
import { badgeForAuthor, badgeForReviewer, circleOf, type ApprovalRow } from "./approval-state";

const row = (reviewerId: string, stale = false): ApprovalRow => ({ reviewerId, stale });

describe("badgeForReviewer", () => {
  it("нет отметки - нет бейджа", () => {
    expect(badgeForReviewer(undefined)).toBeNull();
  });
  it("действующая отметка - сплошной бейдж", () => {
    expect(badgeForReviewer(row("r1"))).toBe("all");
  });
  it("отметка до правки - пунктирный бейдж", () => {
    expect(badgeForReviewer(row("r1", true))).toBe("stale");
  });
});

describe("circleOf", () => {
  it("круг - принявшие приглашение плюс все, кто поставил отметку", () => {
    expect(circleOf([row("r1")], ["r2", "r3"]).sort()).toEqual(["r1", "r2", "r3"]);
  });
  it("не дублирует рецензента, который и принял, и поставил отметку", () => {
    expect(circleOf([row("r1")], ["r1", "r2"]).sort()).toEqual(["r1", "r2"]);
  });
});

describe("badgeForAuthor", () => {
  const accepted = ["r1", "r2", "r3"];
  it("без отметок бейджа нет", () => {
    expect(badgeForAuthor([], accepted)).toBeNull();
  });
  it("согласовали все принявшие - сплошной", () => {
    expect(badgeForAuthor([row("r1"), row("r2"), row("r3")], accepted)).toBe("all");
  });
  it("согласовала часть - контурный", () => {
    expect(badgeForAuthor([row("r1")], accepted)).toBe("part");
  });
  it("все отметки до правки - пунктирный", () => {
    expect(badgeForAuthor([row("r1", true), row("r2", true)], accepted)).toBe("stale");
  });
  it("устаревшая отметка не засчитывается как согласование", () => {
    expect(badgeForAuthor([row("r1"), row("r2", true), row("r3")], accepted)).toBe("part");
  });
  it("рецензент вне списка принявших, но с отметкой, входит в круг", () => {
    expect(badgeForAuthor([row("r9"), row("r1")], ["r1"])).toBe("all");
  });
});

describe("anchorKeyOf", () => {
  it("берёт идентификатор объекта по виду якоря", () => {
    expect(anchorKeyOf({ kind: "question", questionId: "q1" })).toBe("q1");
    expect(anchorKeyOf({ kind: "topic", topicId: "t1" })).toBe("t1");
    expect(anchorKeyOf({ kind: "content-page", contentPageId: "p1" })).toBe("p1");
  });
  it("у экрана и теста целиком ключ пустой", () => {
    expect(anchorKeyOf({ kind: "test" })).toBe("");
    expect(anchorKeyOf({ kind: "start" })).toBe("");
    expect(anchorKeyOf({ kind: "results" })).toBe("");
  });
});
```

- [ ] **Шаг 2. Запустить и убедиться, что падает:**

Run: `npm test -- shared/review/approval-state.test.ts`

Expected: FAIL, модуль `./approval-state` не найден.

- [ ] **Шаг 3. Реализовать.** В `shared/review/anchor.ts` добавить в конец:

```ts
/**
 * Ключ якоря для уникальности отметки: идентификатор объекта или пустая строка у экрана и теста целиком.
 * Общий для сервера (запись) и клиента (поиск своей отметки по якорю).
 */
export function anchorKeyOf(anchor: ReviewAnchor): string {
  switch (anchor.kind) {
    case "question":
      return anchor.questionId ?? "";
    case "content-page":
      return anchor.contentPageId ?? "";
    case "topic":
      return anchor.topicId ?? "";
    default:
      return "";
  }
}
```

Создать `shared/review/approval-state.ts`:

```ts
/**
 * @module shared/review/approval-state
 *
 * PRD-52: правило бейджа «Согласовано». ОДНО на клиент и на тесты сервера, чтобы окно рецензента, карта вопросов
 * и таблицы редактора не разошлись в том, что считается согласованием.
 *
 * Рецензент не видит чужих отметок (решение владельца 2026-11-23), поэтому правил два: для него бейдж описывает
 * только его собственную отметку, для автора и владельца - круг рецензентов.
 */

/** Вид бейджа: `all` - сплошной, `part` - контурный, `stale` - пунктирный. Нет бейджа - `null`. */
export type ApprovalBadge = "all" | "part" | "stale";

/** Минимум, который нужен правилу от строки отметки. */
export interface ApprovalRow {
  reviewerId: string;
  /** Объект менялся после отметки (хеш разошёлся); считает сервер при чтении. */
  stale: boolean;
}

/** Бейдж для рецензента: только его собственная отметка. */
export function badgeForReviewer(own: ApprovalRow | undefined): ApprovalBadge | null {
  if (!own) return null;
  return own.stale ? "stale" : "all";
}

/**
 * Круг рецензентов объекта: принявшие приглашение плюс все, кто поставил отметку. Поставивший отметку считается
 * принявшим всегда - иначе счётчик показал бы согласовавших больше, чем принявших.
 */
export function circleOf(rows: readonly ApprovalRow[], acceptedReviewerIds: readonly string[]): string[] {
  return [...new Set([...acceptedReviewerIds, ...rows.map((r) => r.reviewerId)])];
}

/** Бейдж для автора и владельца: состояние круга рецензентов. */
export function badgeForAuthor(
  rows: readonly ApprovalRow[],
  acceptedReviewerIds: readonly string[],
): ApprovalBadge | null {
  if (rows.length === 0) return null;
  const active = new Set(rows.filter((r) => !r.stale).map((r) => r.reviewerId));
  if (active.size === 0) return "stale";
  const circle = circleOf(rows, acceptedReviewerIds);
  return circle.every((id) => active.has(id)) ? "all" : "part";
}
```

- [ ] **Шаг 4. Запустить:** `npm test -- shared/review/approval-state.test.ts`. Expected: PASS (11 тестов).

- [ ] **Шаг 5. Коммит** (по разрешению): `feat(review): правило бейджа согласования и ключ якоря`.

## Задача 3. Слой данных отметок

**Файлы:** `server/storage/review-approvals-repository.ts`, `server/storage.ts`,
`tests/it/review-approvals-repository.it.test.ts`.

Правила слоя: повторная отметка идемпотентна (время не меняется), если хеш содержимого тот же; если хеш другой
(отметка устарела), отметка пересохраняется с новым временем и хешем; удаляется строка по идентификатору.

- [ ] **Шаг 1. Написать падающий интеграционный тест** (`tests/it/review-approvals-repository.it.test.ts`; шапку с
  `vi.hoisted`/`vi.mock` и `createHarness` скопировать из `tests/it/review-comments-repository.it.test.ts`, класс
  заменить на `ReviewApprovalsRepository`):

```ts
/**
 * @module tests/it/review-approvals-repository.it.test
 * @description PRD-52: слой данных отметок «Согласовано» на реальной базе (pglite). Круглый рейс обязателен: форма
 * правил держится на уникальном индексе и каскаде, которые видит только база.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { tests } from "@shared/schema";
import { createHarness, type Harness } from "./db-harness";

const h = vi.hoisted(() => ({ current: null as Harness | null }));
vi.mock("../../server/db", () => ({
  get db() {
    if (!h.current) throw new Error("harness not initialized");
    return h.current.db;
  },
}));

// eslint-disable-next-line import/first -- must import AFTER vi.mock
import { ReviewApprovalsRepository } from "../../server/storage/review-approvals-repository";

let repo: ReviewApprovalsRepository;
let testId: string;

beforeAll(async () => {
  h.current = await createHarness();
  repo = new ReviewApprovalsRepository();
});
afterAll(async () => {
  await h.current!.close();
});
beforeEach(async () => {
  await h.current!.reset();
  testId = randomUUID();
  await h.current!.db.insert(tests).values([
    { id: testId, title: "Тест на согласование", overallPassRuleJson: { type: "percent", value: 80 } },
  ] as never);
});

function input(over: Record<string, unknown> = {}) {
  return {
    testId,
    reviewerId: "r1",
    anchorKind: "question" as const,
    anchorKey: "q1",
    questionId: "q1",
    topicId: "tp1",
    contentPageId: null,
    contextLabel: "Раздел «О компании» · Вопрос «…»",
    pinnedContentHash: "a".repeat(64),
    ...over,
  };
}

describe("upsertReviewApproval", () => {
  it("создаёт отметку со временем", async () => {
    const row = await repo.upsertReviewApproval(input());
    expect(row.id).toBeTruthy();
    expect(row.approvedAt).toBeInstanceOf(Date);
  });

  it("повтор с тем же хешем идемпотентен: строка и время те же", async () => {
    const first = await repo.upsertReviewApproval(input());
    const second = await repo.upsertReviewApproval(input());
    expect(second.id).toBe(first.id);
    expect(second.approvedAt.getTime()).toBe(first.approvedAt.getTime());
    expect(await repo.listReviewApprovals(testId)).toHaveLength(1);
  });

  it("повтор с другим хешем пересохраняет отметку: новое время и хеш", async () => {
    const first = await repo.upsertReviewApproval(input());
    await new Promise((r) => setTimeout(r, 15));
    const second = await repo.upsertReviewApproval(input({ pinnedContentHash: "b".repeat(64) }));
    expect(second.id).toBe(first.id);
    expect(second.pinnedContentHash).toBe("b".repeat(64));
    expect(second.approvedAt.getTime()).toBeGreaterThan(first.approvedAt.getTime());
  });

  it("у теста целиком и у вопроса разные отметки одного рецензента", async () => {
    await repo.upsertReviewApproval(input());
    await repo.upsertReviewApproval(
      input({ anchorKind: "test", anchorKey: "", questionId: null, topicId: null, pinnedContentHash: null }),
    );
    expect(await repo.listReviewApprovals(testId)).toHaveLength(2);
  });

  it("у разных рецензентов отметки на один объект не мешают друг другу", async () => {
    await repo.upsertReviewApproval(input({ reviewerId: "r1" }));
    await repo.upsertReviewApproval(input({ reviewerId: "r2" }));
    expect(await repo.listReviewApprovals(testId)).toHaveLength(2);
  });
});

describe("listReviewApprovals", () => {
  it("с фильтром по рецензенту отдаёт только его строки", async () => {
    await repo.upsertReviewApproval(input({ reviewerId: "r1" }));
    await repo.upsertReviewApproval(input({ reviewerId: "r2" }));
    const own = await repo.listReviewApprovals(testId, { reviewerId: "r1" });
    expect(own.map((r) => r.reviewerId)).toEqual(["r1"]);
  });
});

describe("deleteReviewApproval", () => {
  it("удаляет строку и сообщает об этом", async () => {
    const row = await repo.upsertReviewApproval(input());
    expect(await repo.deleteReviewApproval(row.id)).toBe(true);
    expect(await repo.getReviewApproval(row.id)).toBeUndefined();
    expect(await repo.deleteReviewApproval(row.id)).toBe(false);
  });
});

describe("каскад", () => {
  it("удаление теста забирает его отметки", async () => {
    await repo.upsertReviewApproval(input());
    await h.current!.db.delete(tests);
    expect(await repo.listReviewApprovals(testId)).toHaveLength(0);
  });
});
```

- [ ] **Шаг 2. Запустить и убедиться, что падает:**

Run: `npm run test:it -- tests/it/review-approvals-repository.it.test.ts`

Expected: FAIL, модуль репозитория не найден.

- [ ] **Шаг 3. Реализовать** `server/storage/review-approvals-repository.ts`:

```ts
/**
 * @module server/storage/review-approvals-repository
 * @description Слой данных ОТМЕТОК «Согласовано» (PRD-52, спека 2026-11-23-review-approval-flag-design).
 *
 * Отметка принадлежит паре «рецензент - объект». Повторная отметка с тем же хешем содержимого идемпотентна и
 * время не меняет; с другим хешем (отметка устарела) пересохраняется как «согласовано снова». Какие строки
 * видит зритель, решает маршрут: слой данных отдаёт то, что просят.
 *
 * Выставляется через фасад `IStorage`, маршрутами напрямую не импортируется.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  testReviewApprovals,
  type TestReviewApproval,
  type InsertTestReviewApproval,
} from "@shared/schema";

/** Поля, которые задаёт вызывающий; идентификатор и время ставит слой данных. */
export type ReviewApprovalInput = Omit<InsertTestReviewApproval, "id" | "approvedAt">;

export class ReviewApprovalsRepository {
  /** Отметки теста по возрастанию времени; с фильтром - только одного рецензента. */
  async listReviewApprovals(testId: string, filter?: { reviewerId?: string }): Promise<TestReviewApproval[]> {
    const where = filter?.reviewerId
      ? and(eq(testReviewApprovals.testId, testId), eq(testReviewApprovals.reviewerId, filter.reviewerId))
      : eq(testReviewApprovals.testId, testId);
    return db.select().from(testReviewApprovals).where(where).orderBy(asc(testReviewApprovals.approvedAt));
  }

  /** Одна отметка по идентификатору. */
  async getReviewApproval(id: string): Promise<TestReviewApproval | undefined> {
    const [row] = await db.select().from(testReviewApprovals).where(eq(testReviewApprovals.id, id));
    return row;
  }

  /**
   * Поставить отметку. Нет строки - создаётся; есть с тем же хешем - возвращается как есть (идемпотентность,
   * время не меняется); есть с другим хешем - хеш, контекст и время обновляются.
   */
  async upsertReviewApproval(input: ReviewApprovalInput): Promise<TestReviewApproval> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(testReviewApprovals)
        .where(
          and(
            eq(testReviewApprovals.testId, input.testId),
            eq(testReviewApprovals.reviewerId, input.reviewerId),
            eq(testReviewApprovals.anchorKind, input.anchorKind),
            eq(testReviewApprovals.anchorKey, input.anchorKey ?? ""),
          ),
        );
      if (!existing) {
        const [created] = await tx
          .insert(testReviewApprovals)
          .values({ ...input, id: randomUUID() })
          .returning();
        return created;
      }
      if ((existing.pinnedContentHash ?? null) === (input.pinnedContentHash ?? null)) return existing;
      const [updated] = await tx
        .update(testReviewApprovals)
        .set({
          pinnedContentHash: input.pinnedContentHash ?? null,
          contextLabel: input.contextLabel ?? null,
          approvedAt: new Date(),
        })
        .where(eq(testReviewApprovals.id, existing.id))
        .returning();
      return updated;
    });
  }

  /** Удалить отметку по идентификатору. Права проверяет маршрут. */
  async deleteReviewApproval(id: string): Promise<boolean> {
    const deleted = await db
      .delete(testReviewApprovals)
      .where(eq(testReviewApprovals.id, id))
      .returning({ id: testReviewApprovals.id });
    return deleted.length > 0;
  }
}
```

- [ ] **Шаг 4. Подключить к фасаду** (`server/storage.ts`). Рядом с импортом `ReviewCommentsRepository` (строка 48):

```ts
import { ReviewApprovalsRepository, type ReviewApprovalInput } from "./storage/review-approvals-repository";
```

В списке импортов типов схемы (рядом с `TestReviewComment`, строка 105) добавить `TestReviewApproval`. В интерфейсе
`IStorage` после `countOpenReviewCommentsByTests` (строка 554):

```ts
  // Отметки «Согласовано» (PRD-52)
  listReviewApprovals(testId: string, filter?: { reviewerId?: string }): Promise<TestReviewApproval[]>;
  getReviewApproval(id: string): Promise<TestReviewApproval | undefined>;
  upsertReviewApproval(input: ReviewApprovalInput): Promise<TestReviewApproval>;
  deleteReviewApproval(id: string): Promise<boolean>;
  markReviewGrantAccepted(testId: string, userId: string): Promise<void>;
```

В классе - поле рядом с `reviewCommentsRepo` (строка 591) и делегаты после методов комментариев (около строки 1740):

```ts
  private readonly reviewApprovalsRepo = new ReviewApprovalsRepository();

  listReviewApprovals(testId: string, filter?: { reviewerId?: string }): Promise<TestReviewApproval[]> {
    return this.reviewApprovalsRepo.listReviewApprovals(testId, filter);
  }

  getReviewApproval(id: string): Promise<TestReviewApproval | undefined> {
    return this.reviewApprovalsRepo.getReviewApproval(id);
  }

  upsertReviewApproval(input: ReviewApprovalInput): Promise<TestReviewApproval> {
    return this.reviewApprovalsRepo.upsertReviewApproval(input);
  }

  deleteReviewApproval(id: string): Promise<boolean> {
    return this.reviewApprovalsRepo.deleteReviewApproval(id);
  }

  markReviewGrantAccepted(testId: string, userId: string): Promise<void> {
    return this.accessRepo.markReviewGrantAccepted(testId, userId);
  }
```

(`markReviewGrantAccepted` реализуется в задаче 4; до неё `npm run check` покажет ошибку именно здесь - это нормально,
задачи 3 и 4 коммитятся вместе.)

- [ ] **Шаг 5. Запустить:** `npm run test:it -- tests/it/review-approvals-repository.it.test.ts`. Expected: PASS.

## Задача 4. Принятие приглашения: `accepted_at`

**Файлы:** `server/storage/access-repository.ts`, `tests/it/review-approvals-repository.it.test.ts` (дополнить).

- [ ] **Шаг 1. Дописать падающий тест** в конец `tests/it/review-approvals-repository.it.test.ts` (в шапку добавить
  `import { testAccessGrants } from "@shared/schema";` и `import { AccessRepository } from
  "../../server/storage/access-repository";`, рядом с `repo` завести `let access: AccessRepository;` и создать его в
  `beforeAll`):

```ts
describe("markReviewGrantAccepted", () => {
  async function grant(level: "review" | "edit") {
    await h.current!.db.insert(testAccessGrants).values({
      id: randomUUID(), testId, userId: "r1", accessLevel: level, grantedBy: "author-1",
    } as never);
  }

  it("ставит время при первом обращении держателя гранта review", async () => {
    await grant("review");
    await access.markReviewGrantAccepted(testId, "r1");
    const [row] = await h.current!.db.select().from(testAccessGrants);
    expect(row.acceptedAt).toBeInstanceOf(Date);
  });

  it("повторное обращение время не меняет", async () => {
    await grant("review");
    await access.markReviewGrantAccepted(testId, "r1");
    const [first] = await h.current!.db.select().from(testAccessGrants);
    await new Promise((r) => setTimeout(r, 15));
    await access.markReviewGrantAccepted(testId, "r1");
    const [second] = await h.current!.db.select().from(testAccessGrants);
    expect(second.acceptedAt!.getTime()).toBe(first.acceptedAt!.getTime());
  });

  it("грант другого уровня не затрагивает", async () => {
    await grant("edit");
    await access.markReviewGrantAccepted(testId, "r1");
    const [row] = await h.current!.db.select().from(testAccessGrants);
    expect(row.acceptedAt).toBeNull();
  });
});
```

- [ ] **Шаг 2. Запустить:** `npm run test:it -- tests/it/review-approvals-repository.it.test.ts`. Expected: FAIL,
  `markReviewGrantAccepted` не определён.

- [ ] **Шаг 3. Реализовать** в `server/storage/access-repository.ts` после `getTestReviewGrant` (импорт `isNull` из
  `drizzle-orm` добавить, если его нет):

```ts
  /**
   * PRD-52: фиксирует, что держатель гранта `review` открыл окно рецензирования этого теста. Пишется ОДИН раз -
   * по нему считается знаменатель «согласовали N из M». Грант другого уровня не затрагивается.
   */
  async markReviewGrantAccepted(testId: string, userId: string): Promise<void> {
    await db.update(testAccessGrants)
      .set({ acceptedAt: new Date() })
      .where(and(
        eq(testAccessGrants.testId, testId),
        eq(testAccessGrants.userId, userId),
        eq(testAccessGrants.accessLevel, "review"),
        isNull(testAccessGrants.acceptedAt),
      ));
  }
```

- [ ] **Шаг 3. Запустить:** тот же файл. Expected: PASS. Затем `npm run check`: ошибок нет.

- [ ] **Шаг 4. Коммит** (по разрешению): `feat(review): слой данных отметок и принятие приглашения`.

## Задача 5. Маршруты отметок

**Файлы:** `server/routes/review.ts`, `tests/review-approvals-routes.test.ts`.

Контракт: `GET /api/tests/:id/review/approvals` отдаёт `{ viewer, approvals, reviewers? }`; рецензенту - только его
строки и без `reviewers`, автору - все строки и список рецензентов. `PUT` ставит отметку и доступен только
держателю гранта `review` (владельцу теста - 403). `DELETE /:approvalId` снимает только свою отметку (чужую - 403,
в том числе владельцу теста). Чтение ленты комментариев и отметок фиксирует принятие приглашения.

- [ ] **Шаг 1. Написать падающие тесты** (`tests/review-approvals-routes.test.ts`). Шапку (`vi.hoisted`, моки
  `storage`, `test-access`, `review-anchor`, `logger`, остальные моки `scorm`) скопировать из
  `tests/review-routes.test.ts`, в `storageMock` добавить `listReviewApprovals`, `getReviewApproval`,
  `upsertReviewApproval`, `deleteReviewApproval`, `markReviewGrantAccepted`, `getTestReviewGrant`. Тесты:

```ts
const approval = (over: Record<string, unknown> = {}) => ({
  id: "a1", testId: "t1", reviewerId: "expert-1", anchorKind: "question", anchorKey: "q1",
  questionId: "q1", topicId: "tp1", contentPageId: null,
  contextLabel: "Раздел «О компании» · Вопрос «…»", pinnedContentHash: "a".repeat(64),
  approvedAt: new Date("2026-11-21T18:40:00Z"), ...over,
});

beforeEach(() => {
  // ...общий набор из review-routes.test.ts, плюс:
  storageMock.listReviewApprovals.mockImplementation(
    async (_t: string, f?: { reviewerId?: string }) =>
      [approval(), approval({ id: "a2", reviewerId: "expert-2" })]
        .filter((r) => !f?.reviewerId || r.reviewerId === f.reviewerId),
  );
  storageMock.getReviewApproval.mockResolvedValue(approval());
  storageMock.upsertReviewApproval.mockImplementation(async (i: Record<string, unknown>) => approval(i));
  storageMock.deleteReviewApproval.mockResolvedValue(true);
  storageMock.markReviewGrantAccepted.mockResolvedValue(undefined);
  storageMock.getTestReviewGrant.mockImplementation(
    async (_t: string, userId: string) => (userId.startsWith("expert") ? { accessLevel: "review" } : undefined),
  );
  storageMock.getTestAccessGrants.mockResolvedValue([
    { testId: "t1", userId: "expert-1", accessLevel: "review", acceptedAt: new Date("2026-11-20") },
    { testId: "t1", userId: "expert-2", accessLevel: "review", acceptedAt: null },
  ]);
});

describe("GET /:id/review/approvals", () => {
  it("рецензенту отдаёт только его строки и не отдаёт список рецензентов", async () => {
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.status).toBe(200);
    expect(res.body.viewer).toBe("reviewer");
    expect(res.body.approvals.map((a: { reviewerId: string }) => a.reviewerId)).toEqual(["expert-1"]);
    expect(res.body.reviewers).toBeUndefined();
  });

  it("запрашивает у хранилища только строки самого рецензента", async () => {
    await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(storageMock.listReviewApprovals).toHaveBeenCalledWith("t1", { reviewerId: "expert-1" });
  });

  it("автору отдаёт все строки и принявших рецензентов", async () => {
    const res = await request(authorApp()).get("/api/tests/t1/review/approvals");
    expect(res.body.viewer).toBe("author");
    expect(res.body.approvals).toHaveLength(2);
    expect(res.body.reviewers.map((r: { userId: string }) => r.userId).sort()).toEqual(["expert-1", "expert-2"]);
  });

  it("помечает отметку устаревшей, когда содержимое разошлось с пином", async () => {
    anchorMock.isAnchorStale.mockResolvedValue(true);
    const res = await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(res.body.approvals[0].stale).toBe(true);
  });

  it("фиксирует принятие приглашения", async () => {
    await request(expertApp()).get("/api/tests/t1/review/approvals");
    expect(storageMock.markReviewGrantAccepted).toHaveBeenCalledWith("t1", "expert-1");
  });

  it("чтение ленты комментариев тоже фиксирует принятие", async () => {
    await request(expertApp()).get("/api/tests/t1/review/comments");
    expect(storageMock.markReviewGrantAccepted).toHaveBeenCalledWith("t1", "expert-1");
  });
});

describe("PUT /:id/review/approvals", () => {
  const body = { anchor: { kind: "question", questionId: "q1", topicId: "tp1" } };

  it("ставит отметку со снимком контекста и хешем", async () => {
    const res = await request(expertApp()).put("/api/tests/t1/review/approvals").send(body);
    expect(res.status).toBe(200);
    expect(storageMock.upsertReviewApproval).toHaveBeenCalledWith(expect.objectContaining({
      testId: "t1", reviewerId: "expert-1", anchorKind: "question", anchorKey: "q1",
      pinnedContentHash: "a".repeat(64),
    }));
  });

  it("владельцу теста без гранта review отказывает: отметок автор не ставит", async () => {
    const res = await request(authorApp()).put("/api/tests/t1/review/approvals").send(body);
    expect(res.status).toBe(403);
    expect(storageMock.upsertReviewApproval).not.toHaveBeenCalled();
  });

  it("отвергает неполное место", async () => {
    const res = await request(expertApp()).put("/api/tests/t1/review/approvals")
      .send({ anchor: { kind: "question" } });
    expect(res.status).toBe(400);
  });

  it("отвергает удалённый объект", async () => {
    anchorMock.isAnchorOrphaned.mockResolvedValue(true);
    const res = await request(expertApp()).put("/api/tests/t1/review/approvals").send(body);
    expect(res.status).toBe(422);
  });

  it("у теста целиком ключ якоря пустой", async () => {
    await request(expertApp()).put("/api/tests/t1/review/approvals").send({ anchor: { kind: "test" } });
    expect(storageMock.upsertReviewApproval).toHaveBeenCalledWith(expect.objectContaining({ anchorKey: "" }));
  });
});

describe("DELETE /:id/review/approvals/:approvalId", () => {
  it("снимает свою отметку", async () => {
    const res = await request(expertApp()).delete("/api/tests/t1/review/approvals/a1");
    expect(res.status).toBe(200);
    expect(storageMock.deleteReviewApproval).toHaveBeenCalledWith("a1");
  });

  it("чужую отметку не снимает никто, включая владельца теста", async () => {
    const res = await request(authorApp()).delete("/api/tests/t1/review/approvals/a1");
    expect(res.status).toBe(403);
    expect(storageMock.deleteReviewApproval).not.toHaveBeenCalled();
  });

  it("отметка другого теста - 404", async () => {
    storageMock.getReviewApproval.mockResolvedValue(approval({ testId: "t2" }));
    const res = await request(expertApp()).delete("/api/tests/t1/review/approvals/a1");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Шаг 2. Запустить:** `npm test -- tests/review-approvals-routes.test.ts`. Expected: FAIL (маршрутов нет, 404).

- [ ] **Шаг 3. Реализовать** в `server/routes/review.ts`. Импорты: `canEditTest` добавить к
  `import { canGrantAccess } from "../services/test-access";`; `anchorKeyOf, resolveAnchorTarget` - к импорту из
  `@shared/review/anchor`. Вставить перед блоком «Прогон рецензирования»:

```ts
// ─── Отметки «Согласовано» ───────────────────────────────────────────────────
// Отметка принадлежит паре «рецензент - объект». Рецензент видит ТОЛЬКО свои (решение владельца 2026-11-23):
// фильтр выполняется здесь, а не на клиенте. Ставит и снимает отметку только держатель гранта `review`:
// автор и владелец теста согласование принимают, а не дают.

/** Имена людей по идентификаторам одним проходом. */
async function nameMap(ids: Iterable<string>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const user = await storage.getUser(id);
      if (user) names.set(id, user.name || user.email || "Участник");
    }),
  );
  return names;
}

/** Первое обращение держателя гранта к окну рецензирования - это и есть «принял приглашение». */
async function noteReviewerAccepted(testId: string, userId: string): Promise<void> {
  try {
    await storage.markReviewGrantAccepted(testId, userId);
  } catch (error) {
    // Отметка о принятии не должна ронять чтение: потеряется только знаменатель счётчика.
    logger.warn("Review acceptance not recorded: " + (error as Error).message, "review");
  }
}

// GET /api/tests/:id/review/approvals — отметки теста с пометками состояния якоря.
router.get("/:id/review/approvals", ...reviewGate, async (req: Request, res: Response) => {
  try {
    const userId = req.currentUser!.id;
    const test = await storage.getTest(req.params.id);
    const isAuthor = Boolean(test) && (await canEditTest(req.effectiveRoles ?? [], userId, test!));
    const viewer = isAuthor ? "author" : "reviewer";
    await noteReviewerAccepted(req.params.id, userId);

    const rows = await storage.listReviewApprovals(
      req.params.id,
      isAuthor ? undefined : { reviewerId: userId },
    );
    const names = await nameMap(rows.map((row) => row.reviewerId));
    const approvals = await Promise.all(
      rows.map(async (row) => {
        const anchor = anchorOf(row);
        const [stale, orphaned] = await Promise.all([
          isAnchorStale(anchor, row.pinnedContentHash),
          isAnchorOrphaned(anchor),
        ]);
        return { ...row, reviewerName: names.get(row.reviewerId) ?? null, stale, orphaned };
      }),
    );
    if (!isAuthor) return res.json({ viewer, approvals });

    // Круг рецензентов автора: принявшие приглашение плюс все, кто ставил отметки.
    const accepted = (await storage.getTestAccessGrants(req.params.id))
      .filter((grant) => grant.accessLevel === "review" && grant.acceptedAt)
      .map((grant) => grant.userId);
    const circle = [...new Set([...accepted, ...rows.map((row) => row.reviewerId)])];
    const circleNames = await nameMap(circle);
    res.json({
      viewer,
      approvals,
      reviewers: circle.map((id) => ({ userId: id, name: circleNames.get(id) ?? null })),
    });
  } catch (error) {
    logger.error("Review approvals read failed: " + (error as Error).message, "review");
    res.status(500).json({ error: "Не удалось прочитать отметки" });
  }
});

// PUT /api/tests/:id/review/approvals — поставить свою отметку.
router.put("/:id/review/approvals", ...reviewGate, async (req: Request, res: Response) => {
  const userId = req.currentUser!.id;
  try {
    if (!(await storage.getTestReviewGrant(req.params.id, userId))) {
      return res.status(403).json({ error: "Согласовывать может только рецензент теста" });
    }
    const anchor = parseAnchor(req.body?.anchor);
    if (!anchor || resolveAnchorTarget(anchor) === null) {
      return res.status(400).json({ error: "Не указано место отметки" });
    }
    if (await isAnchorOrphaned(anchor)) {
      return res.status(422).json({ error: "Объект удалён из теста" });
    }
    const snapshot = await describeAnchor(anchor);
    const row = await storage.upsertReviewApproval({
      testId: req.params.id,
      reviewerId: userId,
      anchorKind: anchor.kind,
      anchorKey: anchorKeyOf(anchor),
      questionId: anchor.questionId ?? null,
      topicId: anchor.topicId ?? null,
      contentPageId: anchor.contentPageId ?? null,
      contextLabel: snapshot.contextLabel,
      pinnedContentHash: snapshot.pinnedContentHash,
    });
    await noteReviewerAccepted(req.params.id, userId);
    res.json(row);
  } catch (error) {
    logger.error("Review approval put failed: " + (error as Error).message, "review");
    res.status(500).json({ error: "Не удалось сохранить отметку" });
  }
});

// DELETE /api/tests/:id/review/approvals/:approvalId — снять свою отметку.
router.delete("/:id/review/approvals/:approvalId", ...reviewGate, async (req: Request, res: Response) => {
  try {
    const row = await storage.getReviewApproval(req.params.approvalId);
    if (!row || row.testId !== req.params.id) {
      return res.status(404).json({ error: "Отметка не найдена" });
    }
    if (row.reviewerId !== req.currentUser!.id) {
      // Чужую отметку не снимает никто, включая владельца теста: согласование - оценка самого рецензента.
      return res.status(403).json({ error: "Чужая отметка" });
    }
    res.json({ deleted: await storage.deleteReviewApproval(row.id) });
  } catch (error) {
    logger.error("Review approval delete failed: " + (error as Error).message, "review");
    res.status(500).json({ error: "Не удалось снять отметку" });
  }
});
```

В обработчик `GET /:id/review/comments` в самое начало блока `try` добавить:

```ts
    await noteReviewerAccepted(req.params.id, req.currentUser!.id);
```

Функции `nameMap` и `noteReviewerAccepted` объявлены ниже обработчика комментариев - допустимо, так как это
объявления функций (поднимаются), но для читаемости объявить их выше блока комментариев.

- [ ] **Шаг 4. Запустить:** `npm test -- tests/review-approvals-routes.test.ts tests/review-routes.test.ts`.
  Expected: PASS обе. В `tests/review-routes.test.ts` в `storageMock` добавить `markReviewGrantAccepted: vi.fn()` и в
  `beforeEach` `mockResolvedValue(undefined)`, иначе тесты чтения комментариев упадут на новом вызове.

- [ ] **Шаг 5. Проверка типов:** `npm run check`. Expected: без ошибок.

- [ ] **Шаг 6. Коммит** (по разрешению): `feat(review): маршруты отметок «Согласовано» с фильтром по зрителю`.

## Задача 6. Переименование вкладки и рейл «Рецензирование»

**Файлы:** `client/src/features/tests/editor/sections/tab-rail.tsx`, `client/src/features/tests/review/review-tab.tsx`,
`client/src/features/tests/editor/test-editor.tsx`, `client/src/features/tests/debug-player/debug-player-page.tsx`,
`client/src/pages/review/review-player-page.tsx`, `shared/review/anchor.ts` (комментарий), тесты, указанные в шаге 1.

Эскиз: `approved/prd52-review-approval.html`, состояния `attn` и `comm`. Рейл - тот же `TabRail`, что у остальных
вкладок; к пункту добавляется значок с числом (`ou-drawer__rail-badge`).

- [ ] **Шаг 1. Обновить тесты под новое название** (они должны упасть до правки кода):

| Файл | Строка | Замена |
| --- | --- | --- |
| `client/src/features/tests/editor/__tests__/test-editor.test.tsx` | 132 | `"Комментарии"` на `"Рецензирование"` |
| `client/src/features/tests/list/__tests__/tests-list.test.tsx` | 800, 806 | в названии и в `/Комментарии/` |
| `client/src/features/tests/debug-player/__tests__/debug-player-page.test.tsx` | 314, 316 | название и `toContain` |
| `client/src/pages/review/__tests__/review-player-page.test.tsx` | 69 | первый элемент массива |

- [ ] **Шаг 2. Дописать тест рейла** в `client/src/features/tests/editor/sections/__tests__/tab-rail.test.tsx`:

```tsx
it("рисует значок с числом у пункта", () => {
  render(
    <TabRail
      items={[{ key: "a", label: "Согласование" }, { key: "b", label: "Комментарии", badge: 3 }]}
      active="a"
      onChange={() => undefined}
      ariaLabel="Разделы"
      testIdPrefix="t"
    >
      <div />
    </TabRail>,
  );
  expect(screen.getByTestId("t-rail-b").querySelector(".ou-drawer__rail-badge")).toHaveTextContent("3");
});
```

- [ ] **Шаг 3. Запустить:** `npm test -- client/src/features/tests/editor/sections/__tests__/tab-rail.test.tsx
  client/src/features/tests/editor/__tests__/test-editor.test.tsx`. Expected: FAIL.

- [ ] **Шаг 4. Реализовать.** В `tab-rail.tsx` в тип `RailItem` добавить поле и вывод:

```ts
  /** Число на значке справа от подписи (например, открытые комментарии); 0 и отсутствие - без значка. */
  badge?: number;
```

В `renderItem` после подписи и точек состояния:

```tsx
          {item.badge ? <span className="ou-drawer__rail-badge">{item.badge}</span> : null}
```

В `test-editor.tsx` `TAB_LABELS.review` заменить на `"Рецензирование"`, подпись заглушки (строка около 1226) -
`"Комментарии и согласование коллег к этому тесту."`. В `debug-player-page.tsx` (строка 44) и
`review-player-page.tsx` (строка 29) заменить `label: "Комментарии"` на `label: "Рецензирование"`, поправить шапочные
комментарии (`review-player-page.tsx:6`). В `shared/review/anchor.ts` (строка 32) заменить «плюс «Комментарии»» на
«плюс «Рецензирование»».

Создать `client/src/features/tests/review/review-tab.tsx`: вкладка с рейлом из двух пунктов. Содержимое пункта
«Согласование» - заглушка до задачи 9, пункта «Комментарии» - существующий `ReviewPanel` (переносится из
`test-editor.tsx`):

```tsx
/**
 * @module features/tests/review/review-tab
 * @description PRD-52: вкладка «Рецензирование» ящика редактора теста. Рейл из двух пунктов - «Согласование» и
 * «Комментарии» (на нём число открытых). Раньше вкладка называлась «Комментарии» и была одной лентой.
 */
import { useState, type ReactNode } from "react";
import { TabRail, type RailItem } from "@/features/tests/editor/sections/tab-rail";

export type ReviewTabKey = "approval" | "comments";

export interface ReviewTabProps {
  openComments: number;
  approval: ReactNode;
  comments: ReactNode;
}

export function ReviewTab({ openComments, approval, comments }: ReviewTabProps) {
  const [active, setActive] = useState<ReviewTabKey>("approval");
  const items: RailItem<ReviewTabKey>[] = [
    { key: "approval", label: "Согласование" },
    { key: "comments", label: "Комментарии", badge: openComments },
  ];
  return (
    <TabRail
      items={items}
      active={active}
      onChange={setActive}
      ariaLabel="Разделы вкладки «Рецензирование»"
      testIdPrefix="review"
    >
      {active === "approval" ? approval : comments}
    </TabRail>
  );
}
```

В `test-editor.tsx` блок `activeTab === "review"` (строки 1016-1038) заменить на `<ReviewTab>`, а тело вкладки
сделать «flush» (как у остальных вкладок с рейлом): в условии класса `ou-drawer__body--flush` убрать `|| activeTab
=== "review"`. Старый `div.tb-settings-content` с `data-testid="settings-pane-review"` исчезает: его роль выполняет
`TabRail`, пункт «Комментарии» получает идентификатор `review-pane-comments` (тестов, которые ищут старый
идентификатор, в репозитории нет).

- [ ] **Шаг 5. Запустить:** файлы шага 3 плюс `client/src/features/tests/list/__tests__/tests-list.test.tsx`,
  `client/src/features/tests/debug-player/__tests__/debug-player-page.test.tsx`,
  `client/src/pages/review/__tests__/review-player-page.test.tsx`. Expected: PASS.

- [ ] **Шаг 6. Коммит** (по разрешению): `refactor(review): вкладка «Комментарии» стала «Рецензированием» с рейлом`.

## Задача 7. Клиентские запросы, хук и модель данных

**Файлы:** `client/src/features/tests/review/review-approval-api.ts`, `use-review-approvals.ts`,
`review-approval-model.ts` и тест `__tests__/review-approval-model.test.ts`.

- [ ] **Шаг 1. Написать падающий тест модели** (`client/src/features/tests/review/__tests__/review-approval-model.test.ts`):

```ts
/**
 * @module features/tests/review/__tests__/review-approval-model.test
 * @description PRD-52: подготовка данных согласования - поиск своей отметки по якорю, сводка разделов, матрица,
 * фильтр. Чистые функции: вся логика экрана здесь, разметка её не повторяет.
 */
import { describe, it, expect } from "vitest";
import {
  findApproval, buildApprovalSections, filterSections, type SectionInput,
} from "../review-approval-model";
import type { ReviewApproval } from "../review-approval-api";

const ap = (over: Partial<ReviewApproval> = {}): ReviewApproval => ({
  id: "a", testId: "t", reviewerId: "r1", reviewerName: "Ирина Петрова", anchorKind: "question", anchorKey: "q1",
  questionId: "q1", topicId: "tp1", contentPageId: null, contextLabel: null, pinnedContentHash: "h",
  approvedAt: "2026-11-21T18:40:00Z", stale: false, orphaned: false, ...over,
});

const sections: SectionInput[] = [
  { topicId: "tp1", title: "Раздел «О компании»", questions: [
    { id: "q1", label: "Вопрос 1" }, { id: "q2", label: "Вопрос 2" }, { id: "q3", label: "Вопрос 3" },
  ] },
  { topicId: "tp2", title: "Раздел «Финансы»", questions: [{ id: "q4", label: "Вопрос 1" }] },
];

describe("findApproval", () => {
  it("находит отметку по якорю", () => {
    expect(findApproval([ap()], { kind: "question", questionId: "q1" })?.id).toBe("a");
  });
  it("тест целиком ищется по пустому ключу", () => {
    const test = ap({ id: "t", anchorKind: "test", anchorKey: "", questionId: null });
    expect(findApproval([ap(), test], { kind: "test" })?.id).toBe("t");
  });
  it("нет отметки - undefined", () => {
    expect(findApproval([ap()], { kind: "question", questionId: "q9" })).toBeUndefined();
  });
});

describe("buildApprovalSections", () => {
  const reviewers = ["r1", "r2"];
  const rows = [
    ap({ reviewerId: "r1", anchorKey: "q1", questionId: "q1" }),
    ap({ id: "b", reviewerId: "r2", anchorKey: "q1", questionId: "q1" }),
    ap({ id: "c", reviewerId: "r1", anchorKey: "q2", questionId: "q2", stale: true }),
    ap({ id: "d", reviewerId: "r1", anchorKey: "q4", questionId: "q4" }),
    ap({ id: "e", reviewerId: "r2", anchorKey: "q4", questionId: "q4" }),
  ];
  const built = buildApprovalSections(sections, rows, reviewers);

  it("считает вопросы по состоянию круга", () => {
    expect(built[0]).toMatchObject({ total: 3, all: 1, stale: 1, none: 1, part: 0 });
    expect(built[1]).toMatchObject({ total: 1, all: 1, stale: 0, none: 0 });
  });
  it("в строке матрицы ячейка пуста там, где рецензент не согласовал", () => {
    const row = built[0].rows.find((r) => r.questionId === "q2")!;
    expect(row.cells.r1?.stale).toBe(true);
    expect(row.cells.r2).toBeNull();
  });
  it("состояние строки совпадает с правилом бейджа автора", () => {
    expect(built[0].rows.map((r) => r.state)).toEqual(["all", "stale", null]);
  });
});

describe("filterSections", () => {
  const built = buildApprovalSections(sections, [
    ap({ reviewerId: "r1", anchorKey: "q4", questionId: "q4" }),
  ], ["r1"]);

  it("«требуют внимания» скрывает раздел, где всё согласовано, и считает скрытые", () => {
    const res = filterSections(built, { mode: "attn", query: "", reviewerId: null });
    expect(res.sections.map((s) => s.topicId)).toEqual(["tp1"]);
    expect(res.hidden).toBe(1);
  });
  it("поиск оставляет строки с найденным текстом", () => {
    const res = filterSections(built, { mode: "all", query: "вопрос 2", reviewerId: null });
    expect(res.sections[0].rows.map((r) => r.questionId)).toEqual(["q2"]);
  });
  it("пустой результат поиска - нет разделов", () => {
    expect(filterSections(built, { mode: "all", query: "бюджет", reviewerId: null }).sections).toEqual([]);
  });
});
```

- [ ] **Шаг 2. Запустить:** `npm test -- client/src/features/tests/review/__tests__/review-approval-model.test.ts`.
  Expected: FAIL, модуль не найден.

- [ ] **Шаг 3. Реализовать** `review-approval-api.ts`:

```ts
/**
 * @module features/tests/review/review-approval-api
 * @description PRD-52: клиентские запросы к API отметок «Согласовано» и форма ответа сервера.
 */
import { apiRequest } from "@/lib/queryClient";
import type { ReviewAnchor, ReviewAnchorKind } from "@shared/review/anchor";

/** Отметка как её отдаёт сервер. */
export interface ReviewApproval {
  id: string;
  testId: string;
  reviewerId: string;
  reviewerName?: string | null;
  anchorKind: ReviewAnchorKind;
  anchorKey: string;
  questionId: string | null;
  topicId: string | null;
  contentPageId: string | null;
  contextLabel: string | null;
  pinnedContentHash: string | null;
  approvedAt: string;
  /** Объект менялся после отметки. */
  stale: boolean;
  /** Объект удалён из теста. */
  orphaned: boolean;
}

/** Ответ `GET`: зритель, отметки и (только автору) круг рецензентов. */
export interface ReviewApprovalsResponse {
  viewer: "author" | "reviewer";
  approvals: ReviewApproval[];
  reviewers?: { userId: string; name: string | null }[];
}

export const reviewApprovalsKey = (testId: string) => ["tests", testId, "review-approvals"] as const;

export async function fetchReviewApprovals(testId: string): Promise<ReviewApprovalsResponse> {
  const res = await apiRequest("GET", `/api/tests/${testId}/review/approvals`);
  return (await res.json()) as ReviewApprovalsResponse;
}

export async function putReviewApproval(testId: string, anchor: ReviewAnchor): Promise<ReviewApproval> {
  const res = await apiRequest("PUT", `/api/tests/${testId}/review/approvals`, { anchor });
  return (await res.json()) as ReviewApproval;
}

export async function deleteReviewApproval(testId: string, approvalId: string): Promise<void> {
  await apiRequest("DELETE", `/api/tests/${testId}/review/approvals/${approvalId}`);
}
```

`use-review-approvals.ts`:

```ts
/**
 * @module features/tests/review/use-review-approvals
 * @description PRD-52: отметки «Согласовано» теста - загрузка и мутации. Кэш общий для всех мест экрана: карточек
 * окна рецензирования, вкладки редактора и бейджей на карте вопросов.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchReviewApprovals, putReviewApproval, deleteReviewApproval, reviewApprovalsKey,
} from "./review-approval-api";
import type { ReviewAnchor } from "@shared/review/anchor";

export function useReviewApprovals(testId: string, options: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const enabled = options.enabled !== false && Boolean(testId);
  const query = useQuery({
    queryKey: reviewApprovalsKey(testId),
    queryFn: () => fetchReviewApprovals(testId),
    enabled,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: reviewApprovalsKey(testId) });

  const approve = useMutation({
    mutationFn: (anchor: ReviewAnchor) => putReviewApproval(testId, anchor),
    onSuccess: invalidate,
  });
  const withdraw = useMutation({
    mutationFn: (approvalId: string) => deleteReviewApproval(testId, approvalId),
    onSuccess: invalidate,
  });

  return {
    viewer: query.data?.viewer ?? null,
    approvals: query.data?.approvals ?? [],
    reviewers: query.data?.reviewers ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    approve,
    withdraw,
  };
}
```

`review-approval-model.ts`:

```ts
/**
 * @module features/tests/review/review-approval-model
 * @description PRD-52: чистая подготовка данных согласования для экрана - поиск отметки по якорю, сводка по
 * разделам, матрица «вопрос - рецензент» и фильтр. Состояние строки считает то же правило, что рисует бейдж на
 * карте (`shared/review/approval-state`), поэтому таблица и карта не расходятся.
 */
import { anchorKeyOf, type ReviewAnchor } from "@shared/review/anchor";
import { badgeForAuthor, type ApprovalBadge } from "@shared/review/approval-state";
import type { ReviewApproval } from "./review-approval-api";

/** Отметка по якорю: в рамках одного зрителя она единственная. */
export function findApproval(approvals: readonly ReviewApproval[], anchor: ReviewAnchor): ReviewApproval | undefined {
  const key = anchorKeyOf(anchor);
  return approvals.find((a) => a.anchorKind === anchor.kind && a.anchorKey === key);
}

/** Раздел и его вопросы - то, что знает ящик теста. */
export interface SectionInput {
  topicId: string;
  title: string;
  questions: { id: string; label: string }[];
}

/** Ячейка матрицы: отметка рецензента или `null`. */
export type MatrixCell = { approvedAt: string; stale: boolean } | null;

export interface MatrixRow {
  questionId: string;
  label: string;
  /** По идентификатору рецензента. */
  cells: Record<string, MatrixCell>;
  state: ApprovalBadge | null;
}

export interface SectionSummary {
  topicId: string;
  title: string;
  total: number;
  /** Согласовали все. */
  all: number;
  /** Согласовала часть. */
  part: number;
  /** Объект менялся после отметок. */
  stale: number;
  /** Нет ни одной отметки. */
  none: number;
  rows: MatrixRow[];
}

/** Сводка по разделам для автора. `reviewerIds` - круг рецензентов (принявшие и поставившие отметки). */
export function buildApprovalSections(
  sections: readonly SectionInput[],
  approvals: readonly ReviewApproval[],
  reviewerIds: readonly string[],
): SectionSummary[] {
  return sections.map((section) => {
    const rows: MatrixRow[] = section.questions.map((q) => {
      const mine = approvals.filter((a) => a.anchorKind === "question" && a.anchorKey === q.id);
      const cells: Record<string, MatrixCell> = {};
      for (const id of reviewerIds) {
        const a = mine.find((m) => m.reviewerId === id);
        cells[id] = a ? { approvedAt: a.approvedAt, stale: a.stale } : null;
      }
      return { questionId: q.id, label: q.label, cells, state: badgeForAuthor(mine, reviewerIds) };
    });
    const count = (state: ApprovalBadge | null) => rows.filter((r) => r.state === state).length;
    return {
      topicId: section.topicId, title: section.title, total: rows.length,
      all: count("all"), part: count("part"), stale: count("stale"), none: count(null), rows,
    };
  });
}

export type ApprovalFilterMode = "attn" | "all" | "none" | "stale";

export interface ApprovalFilter {
  mode: ApprovalFilterMode;
  query: string;
  /** Только строки, где этот рецензент ещё не согласовал или согласовал до правки; `null` - без фильтра. */
  reviewerId: string | null;
}

/** Применяет фильтр; раздел без подходящих строк скрывается и считается в `hidden`. */
export function filterSections(
  sections: readonly SectionSummary[],
  filter: ApprovalFilter,
): { sections: SectionSummary[]; hidden: number } {
  const query = filter.query.trim().toLowerCase();
  const keep = (row: MatrixRow): boolean => {
    if (query && !row.label.toLowerCase().includes(query)) return false;
    if (filter.reviewerId) {
      const cell = row.cells[filter.reviewerId];
      if (cell && !cell.stale) return false;
    }
    switch (filter.mode) {
      case "attn": return row.state !== "all";
      case "none": return row.state === null;
      case "stale": return row.state === "stale";
      default: return true;
    }
  };
  const result: SectionSummary[] = [];
  let hidden = 0;
  for (const section of sections) {
    const rows = section.rows.filter(keep);
    if (rows.length === 0) hidden += 1;
    else result.push({ ...section, rows });
  }
  return { sections: result, hidden };
}
```

Замечание к тесту «поиск оставляет строки»: в нём раздел `tp2` скрывается, `hidden` не проверяется - это намеренно.

- [ ] **Шаг 4. Запустить:** тот же файл. Expected: PASS. Затем `npm run check`.

- [ ] **Шаг 5. Коммит** (по разрешению): `feat(review): клиентский API, хук и модель данных согласования`.

## Задача 8. Окно рецензирования: карточки согласования

**Файлы:** `client/src/features/tests/review/review-approval-card.tsx`, `review-approval-block.tsx`,
`review-panel.tsx`, тесты `__tests__/review-approval-block.test.tsx`.

Эскиз: `approved/prd52-review-approval.html`, состояния `none`, `set`, `stale`, `test`, `author`. Разметку открыть и
читать узел за узлом: блок «Согласование» (`tb-section-label`), две карточки (`ou-card--outlined ou-card--sm`),
чекбокс `ou-check`, теги даты, список согласовавших со строками `аватар + имя + дата`, затем «Комментарии» и легенда
«Обозначения на карте вопросов». У рецензента в карточках только его отметка; у автора чекбокса нет, видны все
согласовавшие и счётчик «согласовали N из M».

- [ ] **Шаг 1. Написать падающие тесты** (`review-approval-block.test.tsx`; для запросов подменить модуль
  `review-approval-api` через `vi.mock`, обернуть в `QueryClientProvider`, как в `review-panel.test.tsx`):

```tsx
it("рецензенту показывает чекбокс «Согласовано» у вопроса и у теста", async () => {
  mockApprovals({ viewer: "reviewer", approvals: [] });
  render(<ReviewApprovalBlock testId="t1" screenAnchor={{ kind: "question", questionId: "q1" }} />, wrapper());
  expect(await screen.findAllByRole("checkbox", { name: "Согласовано" })).toHaveLength(2);
});

it("клик по чекбоксу ставит отметку на текущий вопрос", async () => {
  mockApprovals({ viewer: "reviewer", approvals: [] });
  render(<ReviewApprovalBlock testId="t1" screenAnchor={{ kind: "question", questionId: "q1" }} />, wrapper());
  const boxes = await screen.findAllByRole("checkbox", { name: "Согласовано" });
  await userEvent.click(boxes[1]);
  expect(putReviewApproval).toHaveBeenCalledWith("t1", { kind: "question", questionId: "q1" });
});

it("повторный клик по включённому чекбоксу снимает отметку", async () => {
  mockApprovals({ viewer: "reviewer", approvals: [approval({ questionId: "q1", anchorKey: "q1" })] });
  render(<ReviewApprovalBlock testId="t1" screenAnchor={{ kind: "question", questionId: "q1" }} />, wrapper());
  const boxes = await screen.findAllByRole("checkbox", { name: "Согласовано" });
  await userEvent.click(boxes[1]);
  expect(deleteReviewApproval).toHaveBeenCalledWith("t1", "a1");
});

it("устаревшую отметку показывает тегом и кнопкой «Согласовать новую редакцию»", async () => {
  mockApprovals({ viewer: "reviewer", approvals: [approval({ stale: true })] });
  render(<ReviewApprovalBlock testId="t1" screenAnchor={{ kind: "question", questionId: "q1" }} />, wrapper());
  expect(await screen.findByText("по прежней редакции")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Согласовать новую редакцию" }));
  expect(putReviewApproval).toHaveBeenCalledWith("t1", { kind: "question", questionId: "q1" });
});

it("автору чекбокса не даёт, но показывает согласовавших и счётчик", async () => {
  mockApprovals({
    viewer: "author",
    approvals: [approval({ reviewerName: "Ирина Петрова" })],
    reviewers: [{ userId: "r1", name: "Ирина Петрова" }, { userId: "r2", name: "Сергей Ковалёв" }],
  });
  render(<ReviewApprovalBlock testId="t1" screenAnchor={{ kind: "question", questionId: "q1" }} />, wrapper());
  expect(await screen.findByText("Ирина Петрова")).toBeInTheDocument();
  expect(screen.getByText("согласовали 1 из 2")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Согласовано" })).toBeNull();
});
```

(`mockApprovals`, `approval`, `wrapper` - локальные хелперы теста: первый подменяет `fetchReviewApprovals`, второй
строит строку отметки, третий оборачивает в `QueryClientProvider`.)

- [ ] **Шаг 2. Запустить:** `npm test -- client/src/features/tests/review/__tests__/review-approval-block.test.tsx`.
  Expected: FAIL.

- [ ] **Шаг 3. Реализовать.** `review-approval-card.tsx` - одна карточка объекта. Свойства: `title`, `anchor`,
  `viewer`, `own?: ReviewApproval`, `circle?: { approvals; reviewers }`, `onApprove`, `onWithdraw`, `busy`. Разметка
  строго по эскизу; чекбокс - `Checkbox` из `@skillum/ui-kit` с `label="Согласовано"`; дата - `Tag` (`tone="success"`,
  размер `s`) с `toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })`;
  устаревшая - `Tag tone="warning"` с текстом «по прежней редакции», строка «Вопрос изменён после вашей отметки от …»
  и `Button size="s"` «Согласовать новую редакцию»; у автора - список `Avatar` + имя + дата и тег «согласовали N из M».
  Инициалы - функцией `initialsOf` из `review-panel.tsx` (вынести её в общий модуль `review-format.ts` рядом с
  `when()` и использовать в обоих файлах).

`review-approval-block.tsx` - блок «Согласование» над лентой комментариев в режиме `player`: подпись раздела
`tb-section-label`, карточка «Тест в целом» (якорь `{ kind: "test" }`) и карточка текущего объекта (якорь - `screenAnchor`
из `useScreenAnchor`). Данные - `useReviewApprovals(testId)`, найти свою отметку - `findApproval(approvals, anchor)`.
Для рецензента `approvals` уже отфильтрованы сервером; для автора карточка получает все строки по якорю.

В `review-panel.tsx` для `mode === "player"` отрисовать `<ReviewApprovalBlock testId screenAnchor />` перед
панелью инструментов ленты и подписью раздела «Комментарии»; внизу вкладки - легенда
«Обозначения на карте вопросов» (две строки у рецензента, три у автора: `ou-quiz__legend` в `ou-quiz--circle` со
строками, помеченными `data-review-approved`; подписи дословно из эскиза: «вы согласовали», «изменено после вашей
отметки», «согласовали все», «согласовали не все», «изменено после отметки»).

- [ ] **Шаг 3. Запустить:** тест шага 2 и `client/src/features/tests/review/__tests__/review-panel.test.tsx`.
  Expected: PASS (в `review-panel.test.tsx` добавить подмену `fetchReviewApprovals` пустым ответом, чтобы существующие
  тесты не упали на новом запросе).

- [ ] **Шаг 4. Коммит** (по разрешению): `feat(review): карточки согласования в окне рецензирования`.

## Задача 9. Редактор: раздел «Согласование» (сводка, фильтр, матрица)

**Файлы:** `client/src/features/tests/review/review-approval-summary.tsx`, `review-tab.tsx`,
`client/src/features/tests/editor/test-editor.tsx`, тесты `__tests__/review-approval-summary.test.tsx`.

Эскиз: состояния `attn`, `sum`, `empty`. Таблица рецензентов сверху (`tb-table`: рецензент, «Тест в целом»,
«Вопросы»), строка итога «Тест целиком согласовали N из M принявших приглашение», подпись «Согласование по объектам»,
сегмент `SegmentedControl` («Требуют внимания», «Все», «Не согласованы», «До правки»), поле поиска `SearchField`,
выбор рецензента `Select`, затем `Accordion variant="plain"`: заголовок раздела одной строкой, подпись «согласовано
всеми N из M · до правки N · не согласовано N» (нулевые не пишутся), узкая полоса `ProgressBar`, внутри матрица
`tb-table` с фиксированной раскладкой и аватарами в шапке, ячейки - теги даты/«—», легенда ячеек и пейджер по 20
строк; строка «Скрыт N раздел: все вопросы согласованы» и пустой результат «Ничего не найдено по запросу «…»».

- [ ] **Шаг 1. Написать падающие тесты** (`review-approval-summary.test.tsx`), проверяющие поведение, а не
  разметку:

```tsx
it("по умолчанию показывает «Требуют внимания» и скрывает раздел без замечаний", async () => {
  render(<ReviewApprovalSummary testId="t1" sections={SECTIONS} />, wrapper(AUTHOR_DATA));
  expect(await screen.findByText("Раздел «О компании»")).toBeInTheDocument();
  expect(screen.queryByText("Раздел «Охрана труда»")).toBeNull();
  expect(screen.getByText("Скрыт 1 раздел: все вопросы согласованы")).toBeInTheDocument();
});

it("«Все» показывает и раздел без замечаний", async () => {
  render(<ReviewApprovalSummary testId="t1" sections={SECTIONS} />, wrapper(AUTHOR_DATA));
  await userEvent.click(await screen.findByRole("button", { name: "Все" }));
  expect(screen.getByText("Раздел «Охрана труда»")).toBeInTheDocument();
});

it("подпись раздела не пишет нулевые счётчики", async () => {
  render(<ReviewApprovalSummary testId="t1" sections={SECTIONS} />, wrapper(AUTHOR_DATA));
  await userEvent.click(await screen.findByRole("button", { name: "Все" }));
  expect(screen.getByText("согласовано всеми 18 из 18")).toBeInTheDocument();
});

it("поиск без совпадений показывает пустой результат", async () => {
  render(<ReviewApprovalSummary testId="t1" sections={SECTIONS} />, wrapper(AUTHOR_DATA));
  await userEvent.type(await screen.findByRole("searchbox"), "бюджет");
  expect(screen.getByText("Ничего не найдено по запросу «бюджет»")).toBeInTheDocument();
});

it("раскрытый раздел показывает матрицу с датой отметки", async () => {
  render(<ReviewApprovalSummary testId="t1" sections={SECTIONS} />, wrapper(AUTHOR_DATA));
  await userEvent.click(await screen.findByText("Раздел «О компании»"));
  expect(screen.getByText("21.11 18:41")).toBeInTheDocument();
});
```

(`SECTIONS` и `AUTHOR_DATA` - фикстуры: разделы по эскизу и ответ `GET` с тремя принявшими рецензентами.)

- [ ] **Шаг 2. Запустить:** `npm test -- client/src/features/tests/review/__tests__/review-approval-summary.test.tsx`.
  Expected: FAIL.

- [ ] **Шаг 3. Реализовать** `ReviewApprovalSummary`: данные - `useReviewApprovals`, разделы - `buildApprovalSections`,
  фильтр - `filterSections`, состояние фильтра и раскрытых разделов - локальное (`useState`, по умолчанию
  `mode: "attn"`, раскрыт первый раздел с замечаниями). Дата в ячейке - `DD.MM HH:mm`. Страница матрицы - 20 строк.
  Если `viewer === "reviewer"`, компонент возвращает `null`: рецензенту раздела нет.

В `test-editor.tsx` собрать `sections` для сводки из состава теста (разделы - `editor.model.sections`, вопросы -
`reviewQuestions.data` по `topicId`, подпись - `Вопрос N «…»` через `questionLabel`) и передать
`<ReviewApprovalSummary>` в пункт `approval` вкладки `ReviewTab`.

- [ ] **Шаг 4. Запустить:** тест шага 2 и `client/src/features/tests/editor/__tests__/test-editor.test.tsx`.
  Expected: PASS.

- [ ] **Шаг 5. Коммит** (по разрешению): `feat(review): сводка и матрица согласования в редакторе`.

## Задача 10. Бейджи на карте вопросов

**Файлы:** `client/src/features/tests/review/approval-marks.ts`, `approval-marks.css`, `use-approval-marks.ts`,
`client/src/styles/tb-components.css`, `debug-player-page.tsx`, `review-player-page.tsx`, тесты
`__tests__/approval-marks.test.ts`.

Карта вопросов живёт в iframe с пакетом, поэтому стили `tb-components.css` туда не попадают: хост инжектирует тот же
CSS в документ iframe. Единственный источник правил - `approval-marks.css`; `tb-components.css` подключает его через
`@import` (эскиз продолжает грузить `tb-components.css`), хост берёт его текст через `?raw`.

- [ ] **Шаг 1. Написать падающие тесты** (`approval-marks.test.ts`, окружение jsdom - как у соседних клиентских тестов):

```ts
/**
 * @module features/tests/review/__tests__/approval-marks.test
 * @description PRD-52: бейджи согласования на точках карты вопросов в iframe пакета. Точка знает только индекс
 * `goto:N`, а отметка хранится по идентификатору вопроса, поэтому соответствие берётся из `flatQuestions`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { applyApprovalMarks, ensureApprovalLegend, ensureApprovalStyle } from "../approval-marks";

function mapHtml(): Document {
  const doc = document.implementation.createHTMLDocument("t");
  doc.body.innerHTML = `
    <div data-qnav>
      <div data-qnav-dots>
        <button class="ou-quiz__dot" data-action="goto:0">1</button>
        <button class="ou-quiz__dot" data-action="goto:1">2</button>
      </div>
      <div data-qnav-panel>
        <button class="ou-quiz__dot" data-action="goto:0">1</button>
        <button class="ou-quiz__dot" data-action="goto:1">2</button>
        <div class="tb-qnav__legend"></div>
      </div>
    </div>`;
  return doc;
}

describe("applyApprovalMarks", () => {
  let doc: Document;
  beforeEach(() => { doc = mapHtml(); });

  it("ставит атрибут на точки в строке и в панели одним правилом", () => {
    applyApprovalMarks(doc, ["q1", "q2"], (id) => (id === "q1" ? "all" : null));
    const dots = [...doc.querySelectorAll('.ou-quiz__dot[data-action="goto:0"]')];
    expect(dots).toHaveLength(2);
    for (const d of dots) expect(d.getAttribute("data-review-approved")).toBe("all");
    for (const d of doc.querySelectorAll('.ou-quiz__dot[data-action="goto:1"]')) {
      expect(d.hasAttribute("data-review-approved")).toBe(false);
    }
  });

  it("снимает атрибут, когда отметки больше нет", () => {
    applyApprovalMarks(doc, ["q1", "q2"], () => "part");
    applyApprovalMarks(doc, ["q1", "q2"], () => null);
    expect(doc.querySelector("[data-review-approved]")).toBeNull();
  });

  it("точку без вопроса в списке не трогает", () => {
    applyApprovalMarks(doc, ["q1"], () => "all");
    expect(doc.querySelector('[data-action="goto:1"]')!.hasAttribute("data-review-approved")).toBe(false);
  });
});

describe("ensureApprovalLegend", () => {
  it("дописывает строки легенды один раз", () => {
    const doc = mapHtml();
    ensureApprovalLegend(doc, "reviewer");
    ensureApprovalLegend(doc, "reviewer");
    expect(doc.querySelectorAll("[data-review-legend]")).toHaveLength(2);
  });
  it("у автора три строки", () => {
    const doc = mapHtml();
    ensureApprovalLegend(doc, "author");
    expect(doc.querySelectorAll("[data-review-legend]")).toHaveLength(3);
  });
});

describe("ensureApprovalStyle", () => {
  it("кладёт стиль в документ один раз", () => {
    const doc = mapHtml();
    ensureApprovalStyle(doc, ".x{}");
    ensureApprovalStyle(doc, ".x{}");
    expect(doc.head.querySelectorAll("style[data-review-approval]")).toHaveLength(1);
  });
});
```

- [ ] **Шаг 2. Запустить:** `npm test -- client/src/features/tests/review/__tests__/approval-marks.test.ts`.
  Expected: FAIL.

- [ ] **Шаг 3. Реализовать** `approval-marks.ts`:

```ts
/**
 * @module features/tests/review/approval-marks
 * @description PRD-52: бейджи согласования на точках карты вопросов внутри iframe пакета.
 *
 * Хост ставит на точку атрибут `data-review-approved` (all | part | stale), а рисует бейдж CSS: узлов в DOM экрана
 * нет, поэтому перерисовка экрана, которую пакет делает на каждом вопросе, бейдж не стирает - хосту достаточно
 * повторить атрибуты. Один селектор красит точки в строке карты и в панели «Все вопросы». Шаблон и контракт не
 * меняются, в боевом пакете бейджа нет.
 */
import type { ApprovalBadge } from "@shared/review/approval-state";

const DOT = '.ou-quiz__dot[data-action^="goto:"]';

/** Расставляет бейджи: индекс точки (`goto:N`) переводится в вопрос по порядку выдачи прогона. */
export function applyApprovalMarks(
  doc: Document,
  questionIds: readonly string[],
  badgeOf: (questionId: string) => ApprovalBadge | null,
): void {
  for (const dot of doc.querySelectorAll<HTMLElement>(DOT)) {
    const index = Number.parseInt((dot.getAttribute("data-action") ?? "").slice("goto:".length), 10);
    const id = Number.isFinite(index) ? questionIds[index] : undefined;
    const badge = id ? badgeOf(id) : null;
    if (badge) dot.setAttribute("data-review-approved", badge);
    else dot.removeAttribute("data-review-approved");
  }
}

const LEGEND_ITEMS: Record<"reviewer" | "author", { badge: ApprovalBadge; text: string }[]> = {
  reviewer: [
    { badge: "all", text: "вы согласовали" },
    { badge: "stale", text: "изменено после вашей отметки" },
  ],
  author: [
    { badge: "all", text: "согласовали все" },
    { badge: "part", text: "согласовали не все" },
    { badge: "stale", text: "изменено после отметки" },
  ],
};

/** Дописывает строки отметок в легенду панели «Все вопросы». Повторный вызов ничего не дублирует. */
export function ensureApprovalLegend(doc: Document, viewer: "reviewer" | "author"): void {
  const legend = doc.querySelector<HTMLElement>("[data-qnav-panel] .tb-qnav__legend");
  if (!legend || legend.querySelector("[data-review-legend]")) return;
  for (const item of LEGEND_ITEMS[viewer]) {
    const el = doc.createElement("span");
    el.className = "ou-quiz__legend-item";
    el.setAttribute("data-review-legend", item.badge);
    const dot = doc.createElement("span");
    dot.className = "ou-quiz__legend-dot";
    dot.setAttribute("data-review-approved", item.badge);
    el.append(dot, doc.createTextNode(item.text));
    legend.append(el);
  }
}

/** Кладёт стиль бейджа в документ iframe один раз. */
export function ensureApprovalStyle(doc: Document, css: string): void {
  if (doc.head.querySelector("style[data-review-approval]")) return;
  const style = doc.createElement("style");
  style.setAttribute("data-review-approval", "");
  style.textContent = css;
  doc.head.append(style);
}
```

Перенести правила бейджа из `client/src/styles/tb-components.css` (блок `/* PRD-52 «Согласовано» ... */` в конце файла)
в новый `approval-marks.css` без изменений, а в `tb-components.css` на их месте оставить комментарий и
`@import "../features/tests/review/approval-marks.css";` (директива `@import` должна стоять в самом начале файла -
поставить её в верх файла, комментарий-указатель оставить на старом месте).

`use-approval-marks.ts`:

```ts
/**
 * @module features/tests/review/use-approval-marks
 * @description PRD-52: хук окна рецензирования - держит бейджи согласования на карте вопросов в iframe пакета.
 * Пакет перестраивает экран на каждом вопросе, поэтому атрибуты ставятся заново: по снимку инспектора и по
 * изменениям DOM iframe (кадр откладывается, чтобы не молотить на каждый узел).
 */
import { useEffect, type RefObject } from "react";
import approvalCss from "./approval-marks.css?raw";
import { applyApprovalMarks, ensureApprovalLegend, ensureApprovalStyle } from "./approval-marks";
import type { ApprovalBadge } from "@shared/review/approval-state";

/** Идентификаторы вопросов в порядке выдачи прогона; пусто, пока пакет не стартовал. */
function deliveredQuestionIds(win: Window): string[] {
  const pkg = window.TBInspector?.readPkg?.(win) as { state?: { flatQuestions?: { id: string }[] } } | undefined;
  return (pkg?.state?.flatQuestions ?? []).map((q) => q.id);
}

export function useApprovalMarks(
  frameRef: RefObject<HTMLIFrameElement | null>,
  viewer: "reviewer" | "author" | null,
  badgeOf: (questionId: string) => ApprovalBadge | null,
  /** Меняется на каждый снимок инспектора: повод пересчитать. */
  tick: unknown,
): void {
  useEffect(() => {
    const frame = frameRef.current;
    const win = frame?.contentWindow as unknown as Window | undefined;
    const doc = frame?.contentDocument;
    if (!frame || !win || !doc || !viewer) return undefined;

    let raf = 0;
    const apply = () => {
      raf = 0;
      ensureApprovalStyle(doc, approvalCss);
      ensureApprovalLegend(doc, viewer);
      applyApprovalMarks(doc, deliveredQuestionIds(win), badgeOf);
    };
    const schedule = () => { if (!raf) raf = win.requestAnimationFrame(apply); };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(doc.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (raf) win.cancelAnimationFrame(raf);
    };
  }, [frameRef, viewer, badgeOf, tick]);
}
```

В `debug-player-page.tsx` и `review-player-page.tsx` после `useScreenAnchor` подключить хук: данные берутся из
`useReviewApprovals(testId)`; `badgeOf` строится так (мемоизировать по `approvals` и `reviewers`):

```ts
const badgeOf = useCallback(
  (questionId: string) => {
    const rows = approvals.filter((a) => a.anchorKind === "question" && a.anchorKey === questionId);
    if (viewer === "author") {
      return badgeForAuthor(rows, reviewers.map((r) => r.userId));
    }
    return badgeForReviewer(rows[0]);
  },
  [approvals, reviewers, viewer],
);
useApprovalMarks(iframeRef, viewer, badgeOf, snap);
```

(Рецензент получает от сервера только свои строки, поэтому `rows[0]` - его отметка.) В `review-player-page.tsx` снимка
инспектора нет - передать `runKey` и счётчик загрузки iframe (`onLoad`).

- [ ] **Шаг 4. Запустить:** тест шага 1 и `npm run check`. Expected: PASS.

- [ ] **Шаг 5. Проверить в сборке:** `npm run build`. Expected: сборка проходит, `@import` и `?raw` разрешаются.
  Затем открыть `docs/wireframes/approved/prd52-review-approval.html` через статический сервер: бейджи должны
  по-прежнему рисоваться (эскиз грузит `tb-components.css`).

- [ ] **Шаг 6. Коммит** (по разрешению): `feat(review): бейджи согласования на карте вопросов`.

## Задача 11. Документация

Триггер правила «четыре слоя»: трек добавляет функциональность продукта.

**Файлы:** `docs/specs/2026-11-23-review-approval-flag-design.md` (статус), `docs/specs/prd-52/test-review.md`,
`docs/guides/test-authoring-guide.md`, `docs/reports/ANALYSIS_*.md`, `CLAUDE.md`, `docs/architecture/test-editor-contracts.md`.

- [ ] **Шаг 1. Спека:** в шапке статус «реализовано», ссылка на коммиты; в разделе «Состав эскиза» уточнить то, что
  изменилось при реализации (если изменилось).
- [ ] **Шаг 2. Спека PRD-52** (`docs/specs/prd-52/test-review.md`): добавить раздел «Согласование» со ссылкой на новую
  спеку и пункты FR: отметка на объект, приватность от других рецензентов, принятие приглашения.
- [ ] **Шаг 3. Руководство автора** (`docs/guides/test-authoring-guide.md`, раздел 13): описать рейл
  «Согласование / Комментарии», таблицу рецензентов, фильтр «Требуют внимания», матрицу, значение бейджей; для
  рецензента - чекбокс «Согласовано». Без emoji; проверить `npx markdownlint-cli2 docs/guides/test-authoring-guide.md`.
- [ ] **Шаг 4. Конкурентный анализ** (`docs/reports/ANALYSIS_*.md`): добавить НОВУЮ строку в блок про рецензирование
  («согласование по рецензентам с датой и временем»), а не перевернуть знак существующей; цифры конкурента не менять.
- [ ] **Шаг 5. `CLAUDE.md`:** в абзаце про таблицы добавить `test_review_approvals` и колонку
  `test_access_grants.accepted_at` (миграция `0067`), поправить число таблиц.
- [ ] **Шаг 6. Контракт редактора** (`docs/architecture/test-editor-contracts.md`): вкладка «Рецензирование» с рейлом.
- [ ] **Шаг 7. Проверить:** `npx markdownlint-cli2` по изменённым `.md`. Expected: 0 замечаний.
- [ ] **Шаг 8. Коммит** (по разрешению): `docs(review): документация согласования`.

## Задача 12. Приёмка по эскизу в браузере

Приёмка засчитывается только после поэлементной сверки скриншотов с эскизом, а не по пунктам плана.

- [ ] **Шаг 1. Подготовка:** поднять dev-сервер (`npm run dev`), статический сервер эскизов из корня репозитория,
  учётки: автор и рецензент с грантом `review` на одном тесте (в стенде есть тест с несколькими разделами).
- [ ] **Шаг 2. Снять пары кадров** (эскиз и реализация, ширины 1440 и 1100, светлая и тёмная тема) для состояний:
  `none`, `set`, `stale`, `test`, `author`, `panel`, `attn`, `sum`, `empty`, `comm`. Браузер - свой CDP-драйвер или
  Playwright, как описано в памяти проекта; состояние UI не переживает границу вызовов MCP, поэтому сценарий пишется
  одним скриптом.
- [ ] **Шаг 3. Сверить для каждого состояния:** заголовки разделов, подписи дословно, тип контрола, порядок,
  колонки таблиц, отступы, бейджи трёх видов, легенду. Любое расхождение - не «готово».
- [ ] **Шаг 4. Проверить приватность:** второй рецензент не видит отметок первого ни в окне, ни в ответе
  `GET /review/approvals` (в DevTools); автор видит обоих.
- [ ] **Шаг 5. Проверить границы:** форма не выходит за окно ни по ширине, ни по высоте на 1100x700 и 1440x800.
- [ ] **Шаг 6. Отчёт:** записать результат в `docs/reports/review-approval-acceptance.md` (список состояний,
  найденные расхождения и их исправление).

## Отдельное решение владельца (вне плана)

Порог карты вопросов в шаблоне: `QNAV_NARROW_MAX_WIDTH = 520` в `shared/template/question-map.ts`. При ширине сцены
520-630 пикселей кнопка «Все вопросы» переносится на вторую строку; в эскизе порог поднят до 640. Менять константу и
тест `shared/template/question-map.test.ts` только после отдельного «да»: это правка шаблона, затрагивающая и
боевые пакеты, и бамп контракта шаблона не нужен только если меняется одна константа без изменения разметки.

## Самопроверка плана по спеке

| Требование спеки | Где реализовано |
| --- | --- |
| Решение 1: таблица отметок | задача 1 |
| Решение 2: любой якорь | задачи 3, 5 (`parseAnchor`, `anchorKeyOf`) |
| Решение 3: одна отметка на пару, снимает только автор отметки | задачи 3, 5 |
| Решение 4: пин содержимого, «изменено после отметки» | задачи 3, 5 (`stale`), 8, 9 |
| Решение 5: тест и вопрос независимы | задача 3 (уникальность по якорю) |
| Решение 6: рецензент не видит чужих, фильтр на сервере | задача 5, проверка в задаче 12 |
| Решение 7: ставит только держатель `review` | задача 5 |
| Решение 8: бейдж атрибутом и CSS, без изменения шаблона | задача 10 |
| Решение 9: знаменатель - принявшие, `accepted_at` | задачи 1, 4, 5 |
| Решение 10: вкладка «Рецензирование», рейл | задача 6 |
| Решение 11: соответствие «индекс - вопрос» | задача 10 (`flatQuestions`) |
| Интерфейс 1-3: карточки, карта, редактор | задачи 8, 10, 9 |
| Правило границ окна | задача 12, шаг 5 |
| Тесты спеки | задачи 2-5, 7-10 |
| Документация после выпуска | задача 11 |
