# Чтение темы в контексте теста: план реализации

> **Для исполнителя:** используйте superpowers:executing-plans (выполнение в этой же сессии, по задачам, с
> остановками на проверку). Субагенты запрещены владельцем проекта, поэтому subagent-driven-development не
> применяется. Шаги отмечены флажками `- [ ]`. Коммит делается только по явному разрешению владельца на коммит:
> шаги «Коммит» ниже подготавливают команду, а не разрешают её выполнить.

**Цель:** две связанные правки прав на темы.

1. Кто правит тест, тот видит в ящике этого теста вопросы всех его тем, даже если прав на саму тему у него нет.
   Править эти вопросы и брать тему в другие тесты он по-прежнему не может.
2. Интерфейс не предлагает действие, которое сервер отклонит с `403`. В банке «Темы и вопросы» и в ящике темы
   действие над одним объектом без права скрыто, групповое действие без права хотя бы на один объект выбора
   недоступно (`disabled`).

**Архитектура:** правила фиксируются в ролевой модели (новый раздел 6.5.1 и дополнение 6.6).

- Ящик теста. Сервер получает адрес `GET /api/tests/:id/questions` с гейтом `edit` по тесту: он отдаёт вопросы
  тем, на которые ссылается тест, и список тем только для чтения. Клиент получает один хук `useEditorQuestions`,
  который сливает банк (`GET /api/questions`) с этим списком. Все места ящика теста, которые сейчас читают один
  банк, переходят на хук.
- Банк. Строка темы в `GET /api/topics` получает `rights: { manage, delete, grant }`, посчитанные теми же
  функциями, которыми сервер проверяет действия. Клиент читает их одним помощником `rightsOfTopic` из
  `@shared/access` и по ним скрывает или выключает действия. Заодно закрываются две дыры на сервере, где проверки
  не было вовсе: дублирование вопроса писало копию в чужую тему, дублирование темы читало невидимую тему.

**Стек:** TypeScript, Express, React 19 + `@skillum/ui-kit`, React Query 5, Vitest. Новых зависимостей нет,
миграций нет.

**Источник:** разбор 2026-11-24. Пользователь с правом на тест, но без прав на темы видит в ящике теста пустые
темы. Причина: ящик берёт вопросы из банка `GET /api/questions`, а банк фильтруется по `visibleTopicScope`
(общие темы, свои темы, активные гранты). Права на тест в этот фильтр не входят. Производное право «тема в
контексте моего теста» описано в PRD-15 FR-25 только для мягко отозванного гранта, и на чтение оно тоже не
реализовано: `getActiveTopicGrantsForGrantees` берёт только гранты в состоянии `active`. Реализовано оно только
для сохранения теста: `PUT /api/tests/:id` исключает из проверки темы, на которые тест уже ссылается
(`exempt`, [server/routes/tests.ts](../../server/routes/tests.ts) около строки 1353).

## Правила работы

- Работать в отдельном worktree от локального `main` (задача 0). `EnterWorktree` не использовать: он ветвится
  от устаревшего `origin/main`. Без junction на `node_modules` главной копии клиентские тесты в worktree не
  запустятся.
- Незакоммиченные правки главной копии (`questions-import.ts`, `import-template-guide.md` и тест к ним) чужие:
  их не трогать и в эту ветку не переносить.
- Тесты запускаются только целевыми файлами: `npm test -- <путь>`. Полный прогон и `test:cov` без отдельного «да»
  владельца не запускать.
- Типы проверять без общего кэша: `npx tsc --noEmit --incremental false`. `npm run check` в worktree может
  показать «чисто» по чужому дереву.
- Новых элементов интерфейса план не вводит. Для темы только для чтения панель «Вопросы теста» переходит в уже
  существующее состояние «без перехода в ящик вопроса» (сейчас оно включается, когда хозяин панели не передал
  `onOpenQuestion` и `onCreateQuestion`). Переход по ссылке на такой вопрос открывает уже существующее окно
  «Посмотреть глазами участника». Если владелец потребует иное поведение, нужен эскиз, а этот план
  останавливается до задачи 7.

Отдельная разведка 2026-11-24 по банку: действия в меню дерева
([content-tree.tsx](../../client/src/features/content/content-tree.tsx), строки около 750-757 и 828-833) гейтятся
только ролью (`can("questions.manage")`, `can("topics.manage")`, `can("topics.access.grant")`), а «Редактировать…»
у вопроса не гейтится ничем. Сервер же проверяет конкретную тему: `canManageTopicContent` для вопросов, правки и
переноса темы; `canDeleteTopic` для удаления темы; `canGrantTopicAccess` для доступа и видимости. Поэтому у темы
с грантом `use`, у общей legacy-темы без владельца и у чужой общей темы автор видит действия, которые кончаются
`403`. Ящик темы показывает вкладку «Доступ» любому, кто открыл тему на правку, и её запрос тоже получает `403`.
Две ручки не проверяют тему совсем: `POST /api/questions/:id/duplicate` (копия ложится в ту же тему, право на
неё не спрашивается) и `POST /api/topics/:id/duplicate` (исходную тему не сверяют с видимой областью).

## Решения по виду

- Действие над одним объектом (пункт меню темы или вопроса, вкладка «Доступ», кнопка ящика) без права
  скрывается: так уже ведут себя эти меню, когда права нет у роли. Если у вопроса в меню не остаётся ни одного
  пункта, кнопка меню «⋯» не рисуется.
- Групповое действие на панели выбора остаётся на месте и становится `disabled`, если его нельзя применить ни к
  одному выбранному объекту. Если можно хотя бы к одному, оно выполняется, а сервер перечисляет пропущенные (так
  уже работают групповые операции над темами). Исключение: «Переместить» для выбранных вопросов выключается,
  если хотя бы один из них в теме без права: перенос идёт запросом на каждый вопрос и прервался бы на середине.
- В списках выбора темы-назначения (новый вопрос, перенос вопросов) остаются только темы с правом `manage`.
  Кнопка «Вопрос» в меню создания скрывается, если таких тем нет.
- Строка темы без `rights` считается строкой без прав. Сервер присылает `rights` всегда; в компонентных тестах
  фикстуры тем получают `rights: FULL_TOPIC_RIGHTS` явно.

## Вне объёма

- Выбор банка сценариев (`GET /api/questions/scenario-banks`) остаётся банковской операцией: в нём видны только
  темы из области пользователя (подтверждено владельцем 2026-11-24).
- Правка вопроса из отладочного прогона (`client/src/features/tests/debug-player/debug-player-page.tsx`, строка
  91) по-прежнему ищет вопрос только в банке.
- Признак «Тема недоступна» в составе теста не меняется: он означает, что темы нет в банке пользователя.

## Карта файлов

Создаются:

| Файл | Ответственность |
| --- | --- |
| `server/services/test-topic-context.ts` | темы, на которые ссылается тест; вопросы этих тем и темы только для чтения |
| `server/services/__tests__/test-topic-context.test.ts` | юнит-тесты сервиса |
| `server/routes/test-context-questions.ts` | маршрут `GET /api/tests/:id/questions` |
| `tests/routes.test-context-questions.test.ts` | тесты маршрута: гейты и ответ |
| `client/src/features/tests/editor/questions/test-context-questions.ts` | ключ кэша, запрос, слияние, выбор окна |
| `client/src/features/tests/editor/questions/__tests__/test-context-questions.test.ts` | юнит-тесты модуля |
| `client/src/features/tests/editor/questions/use-editor-questions.ts` | хук: банк плюс вопросы в контексте теста |
| `client/src/features/tests/editor/questions/__tests__/use-editor-questions.test.tsx` | тесты хука |
| `shared/access/topic-rights.ts` | тип `TopicRights`, константы и помощник `rightsOfTopic` |
| `shared/access/__tests__/topic-rights.test.ts` | юнит-тесты помощника |
| `client/src/features/content/__tests__/content-tree-rights.test.tsx` | действия дерева по правам на тему |

Меняются:

- спецификации: `docs/specs/access-control/role-model.md`, `docs/specs/prd-15/content-ownership.md`;
- общий код: `shared/access/index.ts`;
- сервер: `server/routes/index.ts`, `server/routes/tests.ts`, `server/routes/topics.ts`, `server/routes/questions.ts`,
  `server/services/topic-access.ts`;
- банк: `client/src/features/content/content-tree.tsx`, `client/src/features/topics/topic-drawer.tsx`;
- клиент: `client/src/features/tests/editor/questions/test-questions-section.tsx`,
  `client/src/features/tests/editor/sections/scoring-section.tsx`,
  `client/src/features/tests/editor/sections/variants-editor.tsx`,
  `client/src/features/tests/editor/sections/question-feedback-registry.tsx`,
  `client/src/features/tests/editor/sections/breakdown-feedback-card.tsx`,
  `client/src/features/tests/editor/sections/topics-structure-section.tsx`,
  `client/src/features/tests/editor/sections/scales-section.tsx`, `client/src/features/tests/editor/scales-api.ts`,
  `client/src/features/tests/editor/use-test-editor.ts`, `client/src/features/tests/editor/test-editor.tsx`;
- тесты: `client/src/features/tests/editor/questions/__tests__/test-questions-section.test.tsx`,
  `client/src/features/tests/editor/questions/__tests__/question-analytics.test.tsx`,
  `client/src/features/tests/editor/__tests__/scales.test.ts`, `tests/routes.topic-access.test.ts`,
  `client/src/features/topics/__tests__/topic-drawer.test.tsx`,
  `client/src/features/topics/__tests__/topic-drawer.branches.test.tsx`, фикстуры тем в
  `client/src/features/content/__tests__/content-tree*.test.tsx`;
- документация: `docs/guides/test-authoring-guide.md`, `docs/reports/ANALYSIS_WEBTUTOR_ISPRING.md`, `CLAUDE.md`.

---

### Задача 0: worktree

- [ ] **Шаг 1: создать worktree и junction**

```bash
cd /c/Repositories/test-builder
git worktree add ../test-builder-topic-context -b fix/topic-read-in-test-context main
cd ../test-builder-topic-context
cmd //c mklink //J node_modules ..\\test-builder\\node_modules
```

Ожидается: `Junction created for node_modules`.

- [ ] **Шаг 2: убедиться, что база чистая**

Run: `git status --short`
Expected: пусто.

---

### Задача 1: спецификация

Правка прав начинается с ролевой модели (PRD-15 FR-29).

**Files:**

- Modify: `docs/specs/access-control/role-model.md` (шапка, после 6.5, 6.7, таблица раздела 9)
- Modify: `docs/specs/prd-15/content-ownership.md` (шапка, FR-25)

- [ ] **Шаг 1: шапка ролевой модели**

Заменить строки версии, статуса и даты:

```markdown
**Версия:** 1.6
**Статус:** Согласован (правки трека PRD-15 — 2026-06-11; TD-01 гранты тем
только пользователям — 2026-06-12; роль «Разработчик» и разделение отладки
и генерации SCORM — 2026-07-30; право `media.manage` для медиатеки — 2026-08-02;
право `tests.review.invite` для приглашения рецензентов — 2026-09-10; чтение темы
в контексте теста и права на действия с темой в интерфейсе — 2026-11-24)
**Дата актуализации:** 2026-11-24
```

- [ ] **Шаг 2: новый раздел 6.5.1**

Вставить сразу после строки «Видимая область автора = свои темы + темы с личным грантом + общие.» (перед
заголовком «### 6.6 Гранты доступа к темам»):

````markdown
### 6.5.1 Чтение темы в контексте теста

Право на тест открывает чтение тем, на которые этот тест ссылается: тем его разделов и банков его
пунктов-сценариев. Это обобщение производного права FR-25 PRD-15: оно действует не только после мягкого отзыва
гранта, а у любого, кто правит тест (решение владельца 2026-11-24).

Кто получает право: тот, для кого истинно `canEditTest(u, t)`, то есть владелец теста, держатель гранта `edit`,
держатель `edit` или владелец папки в цепочке теста, AD/SU. Грант `assign`, грант `review` и назначение теста
этого права не дают: строки вопросов несут ключи ответов, а назначенный тест открывает `canReadTest` и ученику.

Что право даёт:

- прочитать все вопросы этих тем вместе с ключами: раздел тянет вопросы из всего пула темы, поэтому виден весь
  пул, а не только уже выданные вопросы;
- пользоваться ими в ящике этого теста: «Вопросы теста», «Оценка», варианты, квоты, вклады в шкалы, обратная
  связь, рецензирование, просмотр вопроса глазами участника;
- сохранить тест, который ссылается на эти темы (исключение уже действующих ссылок при `PUT /api/tests/:id`).

Чего право не даёт:

- тема не появляется в банке пользователя: «Темы и вопросы», `GET /api/topics`, `GET /api/questions`, экспорт;
- тему нельзя добавить в другой тест;
- вопросы темы нельзя править и создавать: это решает `canManageTopicContent` (6.6). В ящике теста у темы без
  права на содержимое нет перехода в ящик вопроса и кнопки «Добавить вопрос». Переход по ссылке на её вопрос
  (комментарий рецензирования, реестр обратной связи) открывает просмотр глазами участника.

Признак «Тема недоступна» в составе теста по-прежнему значит одно: темы нет в банке пользователя.

```text
referencedTopics(t)          := темы разделов t ∪ банки пунктов-сценариев t
readTopicInTest(u, topic, t) := canEditTest(u, t) AND topic ∈ referencedTopics(t)
readOnlyInTest(u, topic, t)  := readTopicInTest(u, topic, t) AND NOT canManageTopicContent(u, topic)
```
````

- [ ] **Шаг 2а: раздел 6.6, права на действия в интерфейсе**

В конец раздела 6.6, после абзаца «Удаление темы — только владелец и AD/SU. …», вставить:

```markdown
Интерфейс не предлагает действие, которое сервер отклонит. Строка темы в `GET /api/topics`
несёт `rights`, посчитанные теми же функциями, что проверяют действия:

| Поле | Функция | Что открывает |
| --- | --- | --- |
| `manage` | `canManageTopicContent` | добавить, править, дублировать, перенести и удалить вопросы темы; править тему и переносить её в папку |
| `delete` | `canDeleteTopic` | удалить тему |
| `grant` | `canGrantTopicAccess` | вкладка «Доступ» ящика темы: видимость и гранты |

Правила показа:

- действие над одним объектом без права скрыто;
- групповое действие недоступно, если его нельзя применить ни к одному выбранному объекту; если
  можно хотя бы к одному, оно выполняется, а пропущенные перечисляются;
- перенос выбранных вопросов недоступен, если хотя бы один из них лежит в теме без `manage`;
- в списках выбора темы-назначения (новый вопрос, перенос вопросов) — только темы с `manage`;
- строка темы без `rights` считается строкой без прав.

Роль по-прежнему открывает действие в принципе: пункт показывается, только если есть и право
роли, и право на эту тему.
```

- [ ] **Шаг 3: раздел 6.7, мягкий отзыв**

Заменить пункт о мягком отзыве:

```markdown
- мягкий (по умолчанию): грант переходит в состояние «отозван, используется» — тема
  исчезает из банка получателя и недоступна новым тестам; в тестах, которые получатель
  правит, тема по-прежнему читается по правилу 6.5.1, без доступа к банку;
```

- [ ] **Шаг 4: раздел 9, новая строка таблицы**

Вставить сразу после строки таблицы, которая начинается с `GET /api/tests` и `GET /api/tests/:id` (право
`tests.read`, область «по доступу»):

```markdown
| `GET /api/tests/:id/questions` | `tests.edit` | edit; вопросы тем `referencedTopics(t)` и темы только для чтения (6.5.1) |
```

В той же таблице:

- строку `GET /api/topics`, `GET /api/questions` дополнить в колонке «Область»: `видимая область (6.5); строка
  темы несёт rights (6.6)`;
- из строки `PUT/DELETE /api/topics/*`, `bulk-*`, `duplicate` убрать `duplicate` и добавить отдельную строку:

```markdown
| `POST /api/topics/:id/duplicate` | `topics.manage` | исходная тема в видимой области (6.5); копия получает владельцем дублирующего |
```

Строка `POST/PUT/DELETE /api/questions/*`, `bulk-*`, `duplicate` не меняется: она уже требует право по теме
вопроса, задача 11 приводит к ней код.

- [ ] **Шаг 5: PRD-15**

В `docs/specs/prd-15/content-ownership.md` заменить строку версии:

```markdown
**Версия:** 1.5 (2026-11-24: FR-25 — чтение темы в контексте теста обобщено на всех, кто правит тест)
```

и в конец пункта FR-25 (после «(BRC-09)») дописать отдельным абзацем того же пункта:

```markdown
  Актуализация 2026-11-24: производное право чтения действует у любого, кто правит тест, а не только после
  мягкого отзыва; правило — [role-model.md, 6.5.1](../access-control/role-model.md), адрес —
  `GET /api/tests/:id/questions`.
```

- [ ] **Шаг 6: проверка разметки**

Run: `npx markdownlint-cli2 docs/specs/access-control/role-model.md docs/specs/prd-15/content-ownership.md`
Expected: `0 error(s)`. Если линтер находит ошибки в строках, которых план не трогал, их не исправлять, а
сообщить владельцу.

- [ ] **Шаг 7: коммит (только по разрешению)**

```bash
git add docs/specs/access-control/role-model.md docs/specs/prd-15/content-ownership.md
git commit -m "docs(access): чтение темы в контексте теста и права на действия с темой (role-model 6.5.1, 6.6)"
```

---

### Задача 2: сервис «темы теста и их вопросы»

**Files:**

- Create: `server/services/test-topic-context.ts`
- Test: `server/services/__tests__/test-topic-context.test.ts`

- [ ] **Шаг 1: падающий тест**

```ts
/**
 * @module server/services/__tests__/test-topic-context.test
 * @description Topics a test references and their questions read in the context of that
 * test (role-model.md 6.5.1): the union of sections and scenario banks, every question of
 * each topic with its name, and the topics the reader may not manage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { storageMock, canManage } = vi.hoisted(() => ({
  storageMock: {
    getTestSections: vi.fn(),
    getTestScenarios: vi.fn(),
    getTopic: vi.fn(),
    getQuestionsByTopic: vi.fn(),
  },
  canManage: vi.fn(),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../topic-access", () => ({ canManageTopicContent: canManage }));

// eslint-disable-next-line import/first -- must import AFTER vi.mock
import { testReferencedTopicIds, testContextQuestions } from "../test-topic-context";

const topic = (id: string) => ({ id, name: `Тема ${id}`, ownerId: "owner", visibility: "private" });

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getTestSections.mockResolvedValue([{ topicId: "t-law" }, { topicId: "t-sec" }]);
  storageMock.getTestScenarios.mockResolvedValue([{ topicId: "t-sim" }, { topicId: "t-law" }]);
  storageMock.getTopic.mockImplementation(async (id: string) => (id === "t-gone" ? undefined : topic(id)));
  storageMock.getQuestionsByTopic.mockImplementation(async (id: string) => [{ id: `q-${id}`, topicId: id }]);
  canManage.mockImplementation(async (_roles: unknown, _user: unknown, t: { id: string }) => t.id === "t-sec");
});

describe("testReferencedTopicIds", () => {
  it("unites section topics and scenario banks without duplicates", async () => {
    expect([...(await testReferencedTopicIds("test-1"))]).toEqual(["t-law", "t-sec", "t-sim"]);
    expect(storageMock.getTestSections).toHaveBeenCalledWith("test-1");
    expect(storageMock.getTestScenarios).toHaveBeenCalledWith("test-1");
  });
});

describe("testContextQuestions", () => {
  it("returns every question of every referenced topic with its topic name", async () => {
    const out = await testContextQuestions(["author"], "user-1", "test-1");
    expect(out.questions).toEqual([
      { id: "q-t-law", topicId: "t-law", topicName: "Тема t-law" },
      { id: "q-t-sec", topicId: "t-sec", topicName: "Тема t-sec" },
      { id: "q-t-sim", topicId: "t-sim", topicName: "Тема t-sim" },
    ]);
  });

  it("names the topics the reader may not manage as read-only", async () => {
    const out = await testContextQuestions(["author"], "user-1", "test-1");
    expect(out.readOnlyTopicIds).toEqual(["t-law", "t-sim"]);
    expect(canManage).toHaveBeenCalledWith(["author"], "user-1", topic("t-law"));
  });

  it("skips a referenced topic that no longer exists", async () => {
    storageMock.getTestSections.mockResolvedValue([{ topicId: "t-gone" }]);
    storageMock.getTestScenarios.mockResolvedValue([]);
    const out = await testContextQuestions(["author"], "user-1", "test-1");
    expect(out).toEqual({ questions: [], readOnlyTopicIds: [] });
    expect(storageMock.getQuestionsByTopic).not.toHaveBeenCalled();
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Run: `npm test -- server/services/__tests__/test-topic-context.test.ts`
Expected: FAIL, `Failed to resolve import "../test-topic-context"`.

- [ ] **Шаг 3: реализация**

```ts
/**
 * @module server/services/test-topic-context
 * @description Reading a topic IN THE CONTEXT OF A TEST (role-model.md 6.5.1).
 *
 * The bank (`GET /api/questions`) shows only the topics in the reader's own scope. A test,
 * though, may draw from a topic outside it: the topic was shared and then made private, a
 * grant was revoked, or the test was handed over to someone who never held the topic. Whoever
 * edits the test still has to see the pools it draws from, otherwise the drawer shows empty
 * topics and every count built on them is wrong.
 *
 * The right is narrow on purpose. It covers only the topics the test references (its sections
 * and the banks of its scenario items), gives nothing in the bank, and says nothing about
 * editing: whether the reader may change a topic's content is still decided by
 * {@link canManageTopicContent}, which is why the answer names the read-only topics.
 *
 * The route gate (`requireTestScope("edit")`) runs before this module; nothing here checks the
 * test right again.
 */

import type { Role } from "@shared/access";
import type { Question } from "@shared/schema";
import { storage } from "../storage";
import { canManageTopicContent } from "./topic-access";

/** A question row as the editor reads it: the bank row plus its topic name. */
export type TestContextQuestion = Question & { topicName: string };

/** Answer of `GET /api/tests/:id/questions`. */
export interface TestContextQuestions {
  /** Every question of every topic the test references, topic by topic, in the author's order. */
  questions: TestContextQuestion[];
  /** Referenced topics whose content the reader may not change. */
  readOnlyTopicIds: string[];
}

/**
 * Topics a test references: its sections and the banks of its scenario items. The same set
 * that `PUT /api/tests/:id` exempts from the visibility check, so reading and saving agree on
 * what «the test's topics» are.
 *
 * @param testId - the test.
 * @returns distinct topic ids, sections first, in their stored order.
 */
export async function testReferencedTopicIds(testId: string): Promise<Set<string>> {
  const [sections, scenarios] = await Promise.all([
    storage.getTestSections(testId),
    storage.getTestScenarios(testId),
  ]);
  return new Set([...sections, ...scenarios].map((s) => s.topicId));
}

/**
 * Questions of the test's topics, read in the context of that test.
 *
 * @param roles - the reader's effective roles.
 * @param userId - the reader's id.
 * @param testId - the test; the caller has already checked the edit scope on it.
 * @returns the questions with their topic names and the read-only topics.
 */
export async function testContextQuestions(
  roles: readonly Role[],
  userId: string,
  testId: string,
): Promise<TestContextQuestions> {
  const questions: TestContextQuestion[] = [];
  const readOnlyTopicIds: string[] = [];
  for (const topicId of await testReferencedTopicIds(testId)) {
    const topic = await storage.getTopic(topicId);
    // A dangling reference is the referential checks' business, not a reading error.
    if (!topic) continue;
    for (const question of await storage.getQuestionsByTopic(topicId)) {
      questions.push({ ...question, topicName: topic.name });
    }
    if (!(await canManageTopicContent(roles, userId, topic))) readOnlyTopicIds.push(topicId);
  }
  return { questions, readOnlyTopicIds };
}
```

- [ ] **Шаг 4: тест проходит**

Run: `npm test -- server/services/__tests__/test-topic-context.test.ts`
Expected: PASS, 4 теста.

- [ ] **Шаг 5: коммит (только по разрешению)**

```bash
git add server/services/test-topic-context.ts server/services/__tests__/test-topic-context.test.ts
git commit -m "feat(access): вопросы тем теста в контексте теста"
```

---

### Задача 3: маршрут `GET /api/tests/:id/questions`

**Files:**

- Create: `server/routes/test-context-questions.ts`
- Modify: `server/routes/index.ts` (импорт и строка в `routerConfig` рядом с другими роутерами `/api/tests`)
- Test: `tests/routes.test-context-questions.test.ts`

- [ ] **Шаг 1: падающий тест**

Проверка прав настоящая (`requirePermission` + `requireTestScope` + `test-access`). Подменяются только
хранилище и сервис из задачи 2. У теста `folderId: null`, поэтому права папок не обращаются к хранилищу.

```ts
/**
 * @module tests/routes.test-context-questions
 * @description GET /api/tests/:id/questions (role-model.md 6.5.1): the questions of a
 * test's topics for whoever may EDIT the test. Covers 401, 403 without `tests.edit`,
 * 404 for a missing test, 403 for an `assign` grant, and 200 for the owner and an
 * `edit` grant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

const { storageMock, serviceMock } = vi.hoisted(() => ({
  storageMock: {
    getTest: vi.fn(),
    getUser: vi.fn(),
    getUserRoles: vi.fn(),
    getTestGrantForUser: vi.fn(),
  },
  serviceMock: { testContextQuestions: vi.fn() },
}));

vi.mock("../server/storage", () => ({ storage: storageMock }));
vi.mock("../server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../server/services/test-topic-context", () => serviceMock);

import testContextQuestionsRouter from "../server/routes/test-context-questions";

function makeApp(signedIn = true) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => {
    if (signedIn) req.session.userId = "user-1";
    next();
  });
  app.use("/api/tests", testContextQuestionsRouter);
  return app;
}

const answer = {
  questions: [{ id: "q1", topicId: "t-law", topicName: "Право" }],
  readOnlyTopicIds: ["t-law"],
};

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getUser.mockResolvedValue({ id: "user-1", status: "active" });
  storageMock.getUserRoles.mockResolvedValue(["author"]);
  storageMock.getTest.mockResolvedValue({ id: "test-1", ownerId: "someone-else", folderId: null });
  storageMock.getTestGrantForUser.mockResolvedValue(undefined);
  serviceMock.testContextQuestions.mockResolvedValue(answer);
});

describe("GET /api/tests/:id/questions", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(makeApp(false)).get("/api/tests/test-1/questions");
    expect(res.status).toBe(401);
  });

  it("returns 403 to a role without tests.edit", async () => {
    storageMock.getUserRoles.mockResolvedValue(["learner"]);
    const res = await request(makeApp()).get("/api/tests/test-1/questions");
    expect(res.status).toBe(403);
    expect(serviceMock.testContextQuestions).not.toHaveBeenCalled();
  });

  it("returns 404 when the test does not exist", async () => {
    storageMock.getTest.mockResolvedValue(undefined);
    const res = await request(makeApp()).get("/api/tests/missing/questions");
    expect(res.status).toBe(404);
  });

  it("refuses an author who holds only an assign grant", async () => {
    storageMock.getTestGrantForUser.mockResolvedValue({ accessLevel: "assign" });
    const res = await request(makeApp()).get("/api/tests/test-1/questions");
    expect(res.status).toBe(403);
    expect(serviceMock.testContextQuestions).not.toHaveBeenCalled();
  });

  it("answers the test owner", async () => {
    storageMock.getTest.mockResolvedValue({ id: "test-1", ownerId: "user-1", folderId: null });
    const res = await request(makeApp()).get("/api/tests/test-1/questions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(answer);
    expect(serviceMock.testContextQuestions).toHaveBeenCalledWith(["author"], "user-1", "test-1");
  });

  it("answers the holder of an edit grant without any topic right", async () => {
    storageMock.getTestGrantForUser.mockResolvedValue({ accessLevel: "edit" });
    const res = await request(makeApp()).get("/api/tests/test-1/questions");
    expect(res.status).toBe(200);
    expect(res.body.readOnlyTopicIds).toEqual(["t-law"]);
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Run: `npm test -- tests/routes.test-context-questions.test.ts`
Expected: FAIL, `Failed to resolve import "../server/routes/test-context-questions"`.

- [ ] **Шаг 3: маршрут**

```ts
/**
 * @module server/routes/test-context-questions
 * @description `GET /api/tests/:id/questions` — the questions of the topics a test references,
 * read IN THE CONTEXT of that test (role-model.md 6.5.1).
 *
 * The bank list `GET /api/questions` filters by the reader's TOPIC scope. This one is gated by
 * the TEST: whoever may edit the test reads the pools it draws from, with no access to the bank.
 * The gate is `edit`, not `read`: `canReadTest` also lets in a learner the test is assigned to,
 * and these rows carry the answer keys.
 */
import { Router, type Request, type Response } from "express";
import { requirePermission } from "../middleware/auth";
import { requireTestScope } from "../middleware/test-scope";
import { logger } from "../logger";
import { testContextQuestions } from "../services/test-topic-context";

const router = Router();

router.get(
  "/:id/questions",
  requirePermission("tests.edit"),
  requireTestScope("edit"),
  async (req: Request, res: Response) => {
    try {
      res.json(await testContextQuestions(req.effectiveRoles ?? [], req.currentUser?.id ?? "", req.params.id));
    } catch (error) {
      logger.error("Get test context questions error: " + (error as Error).message);
      res.status(500).json({ error: "Failed to get test questions" });
    }
  },
);

export default router;
```

- [ ] **Шаг 4: подключить роутер**

В `server/routes/index.ts` добавить импорт рядом с остальными:

```ts
import testContextQuestionsRouter from "./test-context-questions";
```

и строку в `routerConfig` сразу после `{ path: "/api/tests", router: reviewRouter }, ...`:

```ts
  { path: "/api/tests", router: testContextQuestionsRouter }, // вопросы тем теста в контексте теста (role-model 6.5.1)
```

- [ ] **Шаг 5: тест проходит**

Run: `npm test -- tests/routes.test-context-questions.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Шаг 6: адрес не перехвачен другим роутером**

Run: `grep -rn '"/:id/questions"' server/routes`
Expected: одна строка, `server/routes/test-context-questions.ts`.

- [ ] **Шаг 7: коммит (только по разрешению)**

```bash
git add server/routes/test-context-questions.ts server/routes/index.ts tests/routes.test-context-questions.test.ts
git commit -m "feat(access): GET /api/tests/:id/questions для того, кто правит тест"
```

---

### Задача 4: сохранение теста берёт тот же набор тем

`PUT /api/tests/:id` сейчас сам собирает `exempt` из разделов и сценариев. Набор должен быть один на чтение и
сохранение, иначе они однажды разойдутся.

**Files:**

- Modify: `server/routes/tests.ts` (около строк 1353-1355 и импорты)

- [ ] **Шаг 1: заменить сборку `exempt`**

Было:

```ts
    const existingSections = await storage.getTestSections(req.params.id);
    const existingScenarios = await storage.getTestScenarios(req.params.id);
    const exempt = new Set([...existingSections, ...existingScenarios].map((s) => s.topicId));
```

Стало:

```ts
    // role-model.md 6.5.1: the topics the test already references are read in its context,
    // and the same set keeps a re-save from tripping over them.
    const exempt = await testReferencedTopicIds(req.params.id);
```

и добавить импорт рядом с `import { visibleTopic } from "../services/topic-access";`:

```ts
import { testReferencedTopicIds } from "../services/test-topic-context";
```

Перед заменой проверить, что `existingSections` и `existingScenarios` ниже по обработчику не используются:

Run: `grep -n "existingSections\|existingScenarios" server/routes/tests.ts`
Expected: только три заменяемые строки. Если есть другие обращения, оставить чтение разделов для них, а
заменить только сборку `exempt`.

- [ ] **Шаг 2: тесты маршрута тестов проходят**

Run: `npm test -- tests/routes.tests.test.ts tests/routes.tests.coverage.test.ts`
Expected: PASS без новых падений. Если тест подменяет `storage` без `getTestScenarios`, он падал бы и до правки:
сверить с прогоном на `main`.

- [ ] **Шаг 3: коммит (только по разрешению)**

```bash
git add server/routes/tests.ts
git commit -m "refactor(access): сохранение теста и чтение тем в контексте берут один набор тем"
```

---

### Задача 5: клиентский модуль вопросов в контексте теста

**Files:**

- Create: `client/src/features/tests/editor/questions/test-context-questions.ts`
- Test: `client/src/features/tests/editor/questions/__tests__/test-context-questions.test.ts`

- [ ] **Шаг 1: падающий тест**

```ts
/**
 * @module features/tests/editor/questions/__tests__/test-context-questions.test
 * @description Merging the bank with the questions read in the context of a test, the cache
 * key that the bank invalidation reaches, and the choice between the question editor and the
 * learner-eye preview (role-model.md 6.5.1).
 */
import { describe, it, expect } from "vitest";
import {
  mergeQuestionRows,
  questionOpenTarget,
  testContextQuestionsKey,
} from "../test-context-questions";

describe("mergeQuestionRows", () => {
  it("keeps the bank as is when the test adds nothing", () => {
    const bank = [{ id: "a" }, { id: "b" }];
    expect(mergeQuestionRows(bank, undefined)).toEqual(bank);
    expect(mergeQuestionRows(bank, [])).toEqual(bank);
  });

  it("appends only the questions the bank does not carry, bank first", () => {
    const bank = [{ id: "a", topicId: "t1" }];
    const context = [{ id: "a", topicId: "t1" }, { id: "x", topicId: "t2" }];
    expect(mergeQuestionRows(bank, context)).toEqual([
      { id: "a", topicId: "t1" },
      { id: "x", topicId: "t2" },
    ]);
  });

  it("works before the bank has loaded", () => {
    expect(mergeQuestionRows(undefined, [{ id: "x" }])).toEqual([{ id: "x" }]);
    expect(mergeQuestionRows(undefined, undefined)).toEqual([]);
  });
});

describe("testContextQuestionsKey", () => {
  it("starts with the bank key, so invalidating the bank refreshes it", () => {
    expect(testContextQuestionsKey("test-1")).toEqual(["/api/questions", "test-context", "test-1"]);
  });
});

describe("questionOpenTarget", () => {
  const readOnly = new Set(["t-law"]);

  it("opens nothing while the question is unknown", () => {
    expect(questionOpenTarget(null, readOnly)).toBeNull();
  });

  it("opens the preview for a question of a read-only topic", () => {
    expect(questionOpenTarget({ topicId: "t-law" }, readOnly)).toBe("preview");
  });

  it("opens the editor otherwise", () => {
    expect(questionOpenTarget({ topicId: "t-own" }, readOnly)).toBe("editor");
    expect(questionOpenTarget({ topicId: null }, readOnly)).toBe("editor");
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Run: `npm test -- client/src/features/tests/editor/questions/__tests__/test-context-questions.test.ts`
Expected: FAIL, `Failed to resolve import "../test-context-questions"`.

- [ ] **Шаг 3: реализация**

```ts
/**
 * @module features/tests/editor/questions/test-context-questions
 * @description Questions of a test's topics read IN THE CONTEXT of that test
 * (role-model.md 6.5.1), as the test editor needs them.
 *
 * The bank list (`GET /api/questions`) carries only the topics in the reader's own scope. A
 * test may draw from a topic outside it, and whoever edits the test still reads that pool
 * through `GET /api/tests/:id/questions`. The editor wants ONE list, so the two are merged:
 * the bank first, then the questions only the test could supply. A topic is either in the bank
 * whole or not at all, so the order inside each topic stays the author's order.
 *
 * The cache key starts with `/api/questions` on purpose: every place that invalidates the bank
 * after a question is saved, imported or deleted refreshes this list too, without knowing it
 * exists.
 */
import type { Question } from "@shared/schema";

/** A question row as both endpoints return it. */
export type ContextQuestionRow = Question & { topicName?: string };

/** Answer of `GET /api/tests/:id/questions`. */
export interface TestContextQuestionsResponse<T = ContextQuestionRow> {
  /** Every question of every topic the test references. */
  questions: T[];
  /** Topics of the test whose content the reader may not change. */
  readOnlyTopicIds: string[];
}

/** Where a question opened from the test editor goes. */
export type QuestionOpenTarget = "editor" | "preview";

/**
 * React Query key of the test-context list.
 *
 * @param testId - the saved test.
 * @returns a key under the bank key `["/api/questions"]`.
 */
export function testContextQuestionsKey(testId: string): readonly ["/api/questions", "test-context", string] {
  return ["/api/questions", "test-context", testId];
}

/**
 * Load the questions of a test's topics in the context of that test.
 *
 * @param testId - the saved test.
 * @returns the questions and the read-only topics.
 * @throws Error when the server refuses or fails.
 */
export async function fetchTestContextQuestions<T = ContextQuestionRow>(
  testId: string,
): Promise<TestContextQuestionsResponse<T>> {
  const response = await fetch(`/api/tests/${encodeURIComponent(testId)}/questions`, { credentials: "include" });
  if (!response.ok) throw new Error(`GET /api/tests/${testId}/questions → ${response.status}`);
  return response.json();
}

/**
 * The bank plus the questions only the test could supply, without duplicates.
 *
 * @param bank - rows of `GET /api/questions`, or undefined before they load.
 * @param context - rows of `GET /api/tests/:id/questions`, or undefined.
 * @returns a new array: the bank rows, then the context rows the bank does not carry.
 */
export function mergeQuestionRows<T extends { id?: string }>(
  bank: readonly T[] | undefined,
  context: readonly T[] | undefined,
): T[] {
  const base = bank ?? [];
  if (!context || context.length === 0) return [...base];
  const known = new Set(base.map((q) => q.id).filter((id): id is string => Boolean(id)));
  return [...base, ...context.filter((q) => !q.id || !known.has(q.id))];
}

/**
 * Which window a question opened from the test editor gets. A question of a topic the reader
 * may not manage opens as the learner sees it: the question editor would offer a save the
 * server refuses (role-model.md 6.5.1).
 *
 * @param question - the resolved question, or null while it is unknown.
 * @param readOnlyTopicIds - topics of the test the reader may not manage.
 * @returns `"preview"`, `"editor"`, or null when there is nothing to open yet.
 */
export function questionOpenTarget(
  question: { topicId?: string | null } | null | undefined,
  readOnlyTopicIds: ReadonlySet<string>,
): QuestionOpenTarget | null {
  if (!question) return null;
  return question.topicId && readOnlyTopicIds.has(question.topicId) ? "preview" : "editor";
}
```

- [ ] **Шаг 4: тест проходит**

Run: `npm test -- client/src/features/tests/editor/questions/__tests__/test-context-questions.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Шаг 5: коммит (только по разрешению)**

```bash
git add client/src/features/tests/editor/questions/test-context-questions.ts client/src/features/tests/editor/questions/__tests__/test-context-questions.test.ts
git commit -m "feat(editor): слияние банка с вопросами в контексте теста"
```

---

### Задача 6: хук `useEditorQuestions`

**Files:**

- Create: `client/src/features/tests/editor/questions/use-editor-questions.ts`
- Test: `client/src/features/tests/editor/questions/__tests__/use-editor-questions.test.tsx`

- [ ] **Шаг 1: падающий тест**

```tsx
/**
 * @module features/tests/editor/questions/__tests__/use-editor-questions.test
 * @description The editor's one list of questions: the bank merged with the questions read in
 * the context of the saved test, the read-only topics, and the `loaded` flag the validation
 * waits for (role-model.md 6.5.1).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type * as React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEditorQuestions } from "../use-editor-questions";

const BANK = [{ id: "q-own", topicId: "t-own" }];
const CONTEXT = {
  questions: [{ id: "q-own", topicId: "t-own" }, { id: "q-law", topicId: "t-law" }],
  readOnlyTopicIds: ["t-law"],
};

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function bankClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["/api/questions"], BANK);
  return client;
}

afterEach(() => vi.unstubAllGlobals());

describe("useEditorQuestions", () => {
  it("is the bank alone for an unsaved test and asks nothing else", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useEditorQuestions(undefined), { wrapper: wrapperWith(bankClient()) });
    expect(result.current.data).toEqual(BANK);
    expect(result.current.readOnlyTopicIds.size).toBe(0);
    expect(result.current.loaded).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds the questions of the test's topics and names the read-only ones", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => CONTEXT }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useEditorQuestions("test-1"), { wrapper: wrapperWith(bankClient()) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.data.map((q) => q.id)).toEqual(["q-own", "q-law"]);
    expect([...result.current.readOnlyTopicIds]).toEqual(["t-law"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/tests/test-1/questions", { credentials: "include" });
  });

  it("falls back to the bank when the test list is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    const { result } = renderHook(() => useEditorQuestions("test-1"), { wrapper: wrapperWith(bankClient()) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.data).toEqual(BANK);
  });

  it("asks nothing while disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useEditorQuestions("test-1", { enabled: false }), { wrapper: wrapperWith(bankClient()) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Run: `npm test -- client/src/features/tests/editor/questions/__tests__/use-editor-questions.test.tsx`
Expected: FAIL, `Failed to resolve import "../use-editor-questions"`.

- [ ] **Шаг 3: реализация**

```ts
/**
 * @module features/tests/editor/questions/use-editor-questions
 * @description The test editor's one list of questions (role-model.md 6.5.1).
 *
 * Before this hook every tab of the drawer read the bank (`GET /api/questions`) on its own. The
 * bank shows only the reader's own topics, so for whoever edits someone else's test with topics
 * outside their scope the drawer showed empty topics, wrong counts and false «not enough
 * questions» errors. The hook adds the questions the saved test supplies itself
 * (`GET /api/tests/:id/questions`) and names the topics the reader may read but not change.
 *
 * The bank query keeps its key `["/api/questions"]`, so the hook shares the cache with every
 * other reader of the bank and with the existing component tests that seed that key.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchTestContextQuestions,
  mergeQuestionRows,
  testContextQuestionsKey,
  type ContextQuestionRow,
  type TestContextQuestionsResponse,
} from "./test-context-questions";

/** What the hook gives its caller. */
export interface EditorQuestions<T> {
  /** The bank merged with the test's own questions; empty until something loads. */
  data: T[];
  /** The first load is still under way. */
  isLoading: boolean;
  /**
   * Both sources have answered (the test list may have failed; then the bank stands alone).
   * Checks that count questions wait for it, otherwise they would judge an empty list.
   */
  loaded: boolean;
  /** Topics of the test the reader may read but not change. */
  readOnlyTopicIds: ReadonlySet<string>;
}

const NO_TOPICS: ReadonlySet<string> = new Set();

/**
 * Questions for the test editor.
 *
 * @param testId - the saved test, or undefined for a test being created (then only the bank).
 * @param options.enabled - set false to keep both queries idle (default true).
 * @returns the merged list, loading flags and the read-only topics.
 */
export function useEditorQuestions<T extends { id?: string } = ContextQuestionRow>(
  testId: string | undefined,
  options: { enabled?: boolean } = {},
): EditorQuestions<T> {
  const enabled = options.enabled ?? true;
  const withContext = enabled && Boolean(testId);
  const bank = useQuery<T[]>({ queryKey: ["/api/questions"], enabled });
  const context = useQuery<TestContextQuestionsResponse<T>>({
    queryKey: testContextQuestionsKey(testId ?? ""),
    queryFn: () => fetchTestContextQuestions<T>(testId as string),
    enabled: withContext,
  });
  const data = useMemo(
    () => mergeQuestionRows(bank.data, context.data?.questions),
    [bank.data, context.data],
  );
  const readOnlyTopicIds = useMemo(
    () => (context.data ? new Set(context.data.readOnlyTopicIds) : NO_TOPICS),
    [context.data],
  );
  const contextSettled = !withContext || context.data !== undefined || context.isError;
  return {
    data,
    isLoading: bank.isLoading || (withContext && context.isLoading),
    loaded: bank.data !== undefined && contextSettled,
    readOnlyTopicIds,
  };
}
```

- [ ] **Шаг 4: тест проходит**

Run: `npm test -- client/src/features/tests/editor/questions/__tests__/use-editor-questions.test.tsx`
Expected: PASS, 4 теста.

- [ ] **Шаг 5: коммит (только по разрешению)**

```bash
git add client/src/features/tests/editor/questions/use-editor-questions.ts client/src/features/tests/editor/questions/__tests__/use-editor-questions.test.tsx
git commit -m "feat(editor): хук useEditorQuestions — банк и вопросы в контексте теста"
```

---

### Задача 7: «Вопросы теста»

**Files:**

- Modify: `client/src/features/tests/editor/questions/test-questions-section.tsx` (строки 15-17, 65-74)
- Test: `client/src/features/tests/editor/questions/__tests__/test-questions-section.test.tsx`
- Test: `client/src/features/tests/editor/questions/__tests__/question-analytics.test.tsx`

- [ ] **Шаг 1: падающий тест**

В конец `test-questions-section.test.tsx` добавить блок (импорт `afterEach` дописать в строку импорта из
`vitest`, импорт ключа добавить к остальным):

```tsx
import { testContextQuestionsKey } from "../test-context-questions";

describe("<TestQuestionsSection /> — тема в контексте теста (role-model 6.5.1)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The bank does NOT carry the topic «law»; only the test supplies it. */
  function renderInContext(readOnly: boolean) {
    const payload = {
      questions: QUESTIONS.filter((q) => q.topicId === "law"),
      readOnlyTopicIds: readOnly ? ["law"] : [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (String(url).endsWith("/questions") ? payload : []),
      })),
    );
    const c = client(QUESTIONS.filter((q) => q.topicId !== "law"));
    c.setQueryData(testContextQuestionsKey("test-1"), payload);
    c.setQueryData(["tests", "test-1", "review-comments"], []);
    return rtlRender(
      <QueryClientProvider client={c}>
        <TestQuestionsSection
          model={model()}
          topicId="law"
          testId="test-1"
          onOpenQuestion={vi.fn()}
          onCreateQuestion={vi.fn()}
        />
      </QueryClientProvider>,
    );
  }

  it("shows the questions of a topic that is not in the reader's bank", () => {
    renderInContext(false);
    expect(screen.getByTestId("test-questions-row-q1")).toBeTruthy();
    expect(screen.queryByTestId("test-questions-empty")).toBeNull();
  });

  it("keeps the editing actions when the reader may manage the topic", () => {
    renderInContext(false);
    expect(screen.getByTestId("test-questions-open-q1")).toBeTruthy();
    expect(screen.getByTestId("test-questions-add")).toBeTruthy();
  });

  it("leaves only the preview for a read-only topic", () => {
    renderInContext(true);
    expect(screen.getByTestId("test-questions-preview-q1")).toBeTruthy();
    expect(screen.queryByTestId("test-questions-open-q1")).toBeNull();
    expect(screen.queryByTestId("test-questions-add")).toBeNull();
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Run: `npm test -- client/src/features/tests/editor/questions/__tests__/test-questions-section.test.tsx`
Expected: FAIL в новом блоке: строки темы «law» нет, показан `test-questions-empty`.

- [ ] **Шаг 3: перевести панель на хук**

Импорт `useQuery` оставить: он ещё нужен запросам аналитики. Добавить импорт хука:

```ts
import { useEditorQuestions } from "./use-editor-questions";
```

Подпись компонента и чтение вопросов:

```tsx
export function TestQuestionsSection({
  model,
  topicId,
  testId,
  onOpenQuestion: openQuestionProp,
  onCreateQuestion: createQuestionProp,
}: TestQuestionsSectionProps): React.JSX.Element | null {
  const { data: allQuestions, isLoading, readOnlyTopicIds } = useEditorQuestions<QuestionRow>(
    testId ?? model.id,
  );
  // role-model.md 6.5.1: a topic read only in the context of this test offers no way into the
  // question editor — the server would refuse the save. The preview stays.
  const readOnly = readOnlyTopicIds.has(topicId);
  const onOpenQuestion = readOnly ? undefined : openQuestionProp;
  const onCreateQuestion = readOnly ? undefined : createQuestionProp;
```

Строки 72-74 (`const { data: allQuestions = [], isLoading } = useQuery<QuestionRow[]>({ queryKey:
["/api/questions"] });`) удалить. Остальной JSX не меняется: он уже ветвится по `onOpenQuestion` и
`onCreateQuestion`.

В JSDoc модуля (после абзаца «Панель только читает…») дописать абзац:

```ts
 * Вопросы приходят из {@link useEditorQuestions}: банк плюс вопросы тем, которые тест даёт
 * читать сам (role-model.md 6.5.1). У темы, содержимое которой читателю править нельзя, панель
 * не предлагает перехода в ящик вопроса и кнопки «Добавить вопрос» — остаётся просмотр.
```

- [ ] **Шаг 4: закрыть сетевой запрос в тесте аналитики**

`question-analytics.test.tsx` монтирует панель с `testId="test-1"`, и хук теперь спрашивает список теста. В
`renderSection()` после `client.setQueryData(["/api/questions"], QUESTIONS);` добавить:

```ts
  client.setQueryData(testContextQuestionsKey("test-1"), { questions: [], readOnlyTopicIds: [] });
```

и импорт `import { testContextQuestionsKey } from "../test-context-questions";`.

- [ ] **Шаг 5: тесты проходят**

Run: `npm test -- client/src/features/tests/editor/questions/__tests__/`
Expected: PASS, включая три новых теста.

- [ ] **Шаг 6: коммит (только по разрешению)**

```bash
git add client/src/features/tests/editor/questions/
git commit -m "fix(editor): «Вопросы теста» видят темы теста без прав на тему"
```

---

### Задача 8: остальные вкладки ящика

Каждая правка одинакова: чтение банка заменяется хуком с идентификатором теста. Где `useQuery` больше не нужен,
его импорт удаляется (проверка: `grep -n "useQuery" <файл>`).

**Files:**

- Modify: `client/src/features/tests/editor/sections/scoring-section.tsx:110`
- Modify: `client/src/features/tests/editor/sections/question-feedback-registry.tsx:98`
- Modify: `client/src/features/tests/editor/sections/breakdown-feedback-card.tsx:73-75`
- Modify: `client/src/features/tests/editor/sections/topics-structure-section.tsx:298-300`, `TopicRow`, вызов
  `<TopicRow` около строки 676, вызов `<VariantsEditor` около строки 1523
- Modify: `client/src/features/tests/editor/sections/variants-editor.tsx:24-44, 84-88`
- Modify: `client/src/features/tests/editor/use-test-editor.ts:550-567`
- Modify: `client/src/features/tests/editor/scales-api.ts:503-509`,
  `client/src/features/tests/editor/sections/scales-section.tsx:349, 1326`
- Test: `client/src/features/tests/editor/__tests__/scales.test.ts`

- [ ] **Шаг 1: «Оценка»**

```tsx
  const { data: allQuestions } = useEditorQuestions<QuestionRow>(testId ?? model.id);
```

Импорт: `import { useEditorQuestions } from "../questions/use-editor-questions";`; импорт `useQuery` удалить.

- [ ] **Шаг 2: реестр обратной связи**

```tsx
  const { data: questions } = useEditorQuestions<QuestionRow>(model.id);
```

Импорт тот же; `useQuery` удалить.

- [ ] **Шаг 3: обратная связь по подтемам**

```tsx
  const { data: allQuestions } = useEditorQuestions<QuestionTagRow>(model.id);
```

Импорт тот же; `useQuery` удалить.

- [ ] **Шаг 4: «Состав»: квоты и варианты**

В `CompositionSection` заменить чтение банка:

```tsx
  // PRD-11: real sub-topic tags per topic, for the draw-quota Select (FR-07). The test's own
  // topics count too, even when the reader holds no right on them (role-model.md 6.5.1).
  const { data: allQuestions } = useEditorQuestions<QuestionTagRow>(model.id);
```

`useQuery` здесь остаётся (темы). В тип пропсов `TopicRow` добавить:

```tsx
  /** Сохранённый тест: варианты читают вопросы его тем и без прав на тему (role-model 6.5.1). */
  testId?: string;
```

в вызов `<TopicRow` добавить `testId={model.id}`, в вызов `<VariantsEditor` добавить `testId={props.testId}`.

В `VariantsEditorProps` добавить:

```tsx
  /** Сохранённый тест: вопросы его тем видны и без прав на тему (role-model 6.5.1). */
  testId?: string;
```

а в `VariantsEditor`:

```tsx
export function VariantsEditor({
  topicId, topicName, formSet, onChange, error, disabled = false, pointsOf, testId,
}: VariantsEditorProps) {
  const [open, setOpen] = useState(false);
  const { data: allQuestions } = useEditorQuestions<QuestionRow>(testId);
```

Импорт `useEditorQuestions`; `useQuery` удалить.

- [ ] **Шаг 5: проверки черновика**

В `use-test-editor.ts` заменить `questionsQuery` и начало `validationContext`:

```ts
  const questionsQuery = useEditorQuestions<{ id: string; topicId?: string | null; tags?: string[] }>(
    draft?.id,
    { enabled: Boolean(draft) },
  );
  const validationContext = useMemo<ValidationContext>(() => {
    // Until both sources answer the counts would judge a partial list and report shortfalls
    // that are not there.
    if (!questionsQuery.loaded) return {};
    const rows = questionsQuery.data;
```

Зависимости `useMemo`: `[questionsQuery.loaded, questionsQuery.data]`. Комментарий над запросом дополнить
фразой: «Темы теста считаются и без прав на тему (role-model.md 6.5.1).» Импорт
`import { useEditorQuestions } from "./questions/use-editor-questions";`. `useQuery` в файле остаётся.

- [ ] **Шаг 6: вклады в шкалы — падающий тест**

В `scales.test.ts`, в блок `describe("loadContributionQuestions", ...)`, добавить:

```ts
  it("adds the questions the saved test supplies for a topic outside the bank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(url) === "/api/questions"
            ? []
            : {
                questions: [
                  { id: "q-law", topicId: "t", type: "single", prompt: "Q", dataJson: { options: ["A"] }, correctJson: { correctIndex: 0 } },
                ],
                readOnlyTopicIds: ["t"],
              },
      })),
    );
    const out = await loadContributionQuestions(["t"], "test-1");
    expect(out.map((q) => q.id)).toEqual(["q-law"]);
  });

  it("keeps the bank when the test list fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url) === "/api/questions"
          ? { ok: true, status: 200, json: async () => [{ id: "q1", topicId: "t", type: "single", dataJson: { options: ["A"] }, correctJson: {} }] }
          : { ok: false, status: 403, json: async () => ({}) },
      ),
    );
    const out = await loadContributionQuestions(["t"], "test-1");
    expect(out.map((q) => q.id)).toEqual(["q1"]);
  });
```

Run: `npm test -- client/src/features/tests/editor/__tests__/scales.test.ts`
Expected: FAIL в первом новом тесте: `[]` вместо `["q-law"]`.

- [ ] **Шаг 7: вклады в шкалы — реализация**

В `scales-api.ts`:

```ts
/**
 * Load the test's questions (filtered to its topics) with their enumerated answer
 * units, for the «Вклады вопросов» matrix. Questions are returned in the order
 * GET /api/questions yields them, grouped by the test's topics; for a saved test the
 * questions it supplies itself are appended (role-model.md 6.5.1).
 *
 * @param topicIds - the test's topics.
 * @param testId - the saved test, if any.
 */
export async function loadContributionQuestions(topicIds: string[], testId?: string): Promise<ContributionQuestion[]> {
  const [raw, context] = await Promise.all([
    fetchJson("/api/questions"),
    // A refused or failed test list leaves the bank alone, as before.
    testId ? fetchTestContextQuestions<RawQuestion>(testId).catch(() => null) : Promise.resolve(null),
  ]);
  const topicSet = new Set(topicIds);
  const bank = Array.isArray(raw) ? (raw as RawQuestion[]) : [];
  const list = mergeQuestionRows(bank, context?.questions);
  return list
```

(дальше без изменений: `.filter((q) => topicSet.has(q.topicId))...`). Импорт:

```ts
import { fetchTestContextQuestions, mergeQuestionRows } from "./questions/test-context-questions";
```

В `scales-section.tsx` оба вызова получают идентификатор теста, а он входит в зависимости эффекта:

```ts
    loadContributionQuestions(topicIds, model.id)
```

```ts
  }, [topicIds, model.id]);
```

(для каждого из двух `useEffect`, строки около 349 и 1326; у каждого найти его массив зависимостей
`[topicIds]`).

- [ ] **Шаг 8: тесты проходят**

Run:

```bash
npm test -- client/src/features/tests/editor/__tests__/scales.test.ts client/src/features/tests/editor/sections/__tests__/ client/src/features/tests/editor/__tests__/test-editor.test.tsx client/src/features/tests/editor/__tests__/test-editor.branches.test.tsx
```

Expected: PASS. Если тест компонента падает из-за нового запроса `/api/tests/<id>/questions` (заглушка `fetch`
не знает адреса и отвечает не так, как ждёт компонент), добавить в его клиент
`setQueryData(testContextQuestionsKey("<id>"), { questions: [], readOnlyTopicIds: [] })` — как в задаче 7, шаг 4.
Логику компонентов ради теста не менять.

- [ ] **Шаг 9: коммит (только по разрешению)**

```bash
git add client/src/features/tests/editor/
git commit -m "fix(editor): вкладки ящика теста читают вопросы тем теста без прав на тему"
```

---

### Задача 9: ящик теста — переход к вопросу

Переход к вопросу из реестра обратной связи и из комментария рецензирования идёт через `reviewQuestionId` в
`test-editor.tsx`. Для темы только для чтения он должен открывать просмотр, а не редактор.

**Files:**

- Modify: `client/src/features/tests/editor/test-editor.tsx` (строки 311-316, 1081-1100, импорты)

- [ ] **Шаг 1: список вопросов через хук**

Заменить:

```tsx
  const reviewQuestions = useQuery<Question[]>({
    queryKey: ["/api/questions"],
    // Нужны в двух местах: открыть карточку вопроса по якорю и предложить вопросы
    // раздела во втором поле формы комментария. Второе — сразу на вкладке.
    enabled: questionDrawerOpen || activeTab === "review",
  });
```

на:

```tsx
  // Нужны в двух местах: открыть карточку вопроса по якорю и предложить вопросы
  // раздела во втором поле формы комментария. Второе — сразу на вкладке. Вопросы тем теста
  // видны и без прав на тему (role-model.md 6.5.1).
  const reviewQuestions = useEditorQuestions<ContextQuestionRow>(editor.model?.id, {
    enabled: questionDrawerOpen || activeTab === "review",
  });
```

После `const reviewQuestion = ...` добавить:

```tsx
  // role-model.md 6.5.1: a question of a topic the reader may not manage opens as the learner
  // sees it, not in the editor whose save the server would refuse.
  const reviewQuestionTarget = questionOpenTarget(reviewQuestion, reviewQuestions.readOnlyTopicIds);
```

Остальные обращения `reviewQuestions.data ?? []` (строки около 325, 330, 700, 730) остаются как есть: `data`
теперь всегда массив, `?? []` безвреден. Тип `Question` в `reviewApprovalSections` (`new Map<string,
Question[]>()`) остаётся совместимым: `ContextQuestionRow` расширяет `Question`.

Импорты:

```tsx
import { QuestionPreviewModal } from "@/features/questions/question-preview-modal";
import { useEditorQuestions } from "./questions/use-editor-questions";
import { questionOpenTarget, type ContextQuestionRow } from "./questions/test-context-questions";
```

- [ ] **Шаг 2: окно по месту**

Заменить начало ветки рендера `{reviewQuestionId ? (`:

```tsx
          {reviewQuestionId && reviewQuestion && reviewQuestionTarget === "preview" ? (
            <QuestionPreviewModal
              open
              question={reviewQuestion}
              topicName={reviewQuestion.topicName}
              onClose={() => setReviewQuestionId(null)}
            />
          ) : reviewQuestionId ? (
            <QuestionEditorDrawer
```

Остальная часть ветки (`QuestionEditorDrawer` для правки и для создания) не меняется.

- [ ] **Шаг 3: типы**

Run: `npx tsc --noEmit --incremental false`
Expected: exit 0. Чужие ошибки с базы `main` назвать по файлам и не исправлять.

- [ ] **Шаг 4: тесты ящика проходят**

Run:

```bash
npm test -- client/src/features/tests/editor/__tests__/test-editor.test.tsx client/src/features/tests/editor/__tests__/test-editor.branches.test.tsx client/src/features/tests/editor/__tests__/test-editor.coverage.test.tsx
```

Expected: PASS. Падение из-за нового запроса чинится, как в задаче 8, шаг 8.

- [ ] **Шаг 5: коммит (только по разрешению)**

```bash
git add client/src/features/tests/editor/test-editor.tsx
git commit -m "fix(editor): вопрос темы только для чтения открывается просмотром"
```

---

### Задача 10: общий помощник прав на тему

**Files:**

- Create: `shared/access/topic-rights.ts`
- Modify: `shared/access/index.ts`
- Test: `shared/access/__tests__/topic-rights.test.ts`

- [ ] **Шаг 1: падающий тест**

```ts
/**
 * @module shared/access/__tests__/topic-rights.test
 * @description The per-topic rights carried by a bank list row (role-model.md 6.6): a row
 * gives what it carries, and a row without them gives nothing.
 */
import { describe, it, expect } from "vitest";
import { FULL_TOPIC_RIGHTS, NO_TOPIC_RIGHTS, rightsOfTopic } from "../topic-rights";

describe("rightsOfTopic", () => {
  it("returns the rights the row carries", () => {
    const rights = { manage: true, delete: false, grant: false };
    expect(rightsOfTopic({ id: "t1", rights })).toEqual(rights);
  });

  it("grants nothing to a row without rights", () => {
    expect(rightsOfTopic({ id: "t1" })).toEqual(NO_TOPIC_RIGHTS);
    expect(rightsOfTopic({ id: "t1", rights: null })).toEqual(NO_TOPIC_RIGHTS);
    expect(rightsOfTopic(null)).toEqual(NO_TOPIC_RIGHTS);
    expect(rightsOfTopic(undefined)).toEqual(NO_TOPIC_RIGHTS);
  });

  it("keeps the constants frozen", () => {
    expect(Object.isFrozen(NO_TOPIC_RIGHTS)).toBe(true);
    expect(FULL_TOPIC_RIGHTS).toEqual({ manage: true, delete: true, grant: true });
  });
});
```

Run: `npm test -- shared/access/__tests__/topic-rights.test.ts`
Expected: FAIL, `Failed to resolve import "../topic-rights"`.

- [ ] **Шаг 2: реализация**

```ts
/**
 * @module shared/access/topic-rights
 * @description What the reader may do with one topic of the bank list (role-model.md 6.6).
 *
 * The server checks every topic action against a SPECIFIC topic; the role only opens the action
 * in principle. So the list `GET /api/topics` carries the per-topic answer, and the screens never
 * offer an action the server would refuse with 403. The fields are computed on the server by the
 * same predicates that guard the routes (`server/services/topic-access.ts`).
 */

/** Per-topic rights of the reader. */
export interface TopicRights {
  /** `canManageTopicContent`: the topic's questions, its properties and its folder. */
  manage: boolean;
  /** `canDeleteTopic`: deleting the topic. */
  delete: boolean;
  /** `canGrantTopicAccess`: visibility and grants. */
  grant: boolean;
}

/** No right at all — what a row without `rights` gives. */
export const NO_TOPIC_RIGHTS: Readonly<TopicRights> = Object.freeze({ manage: false, delete: false, grant: false });

/** Every right — what an administrator's rows carry; also the fixture of component tests. */
export const FULL_TOPIC_RIGHTS: Readonly<TopicRights> = Object.freeze({ manage: true, delete: true, grant: true });

/**
 * Rights carried by a topic row. An absent answer is not a permission: a row without `rights`
 * gives nothing.
 *
 * @param topic - a row of `GET /api/topics`, or nothing.
 * @returns the row's rights, or {@link NO_TOPIC_RIGHTS}.
 */
export function rightsOfTopic(
  topic: { id?: string; rights?: TopicRights | null } | null | undefined,
): Readonly<TopicRights> {
  return topic?.rights ?? NO_TOPIC_RIGHTS;
}
```

В `shared/access/index.ts` добавить строку:

```ts
export * from "./topic-rights";
```

- [ ] **Шаг 3: тест проходит**

Run: `npm test -- shared/access/__tests__/topic-rights.test.ts`
Expected: PASS, 3 теста.

- [ ] **Шаг 4: коммит (только по разрешению)**

```bash
git add shared/access/topic-rights.ts shared/access/index.ts shared/access/__tests__/topic-rights.test.ts
git commit -m "feat(access): права на тему для строки списка (role-model 6.6)"
```

---

### Задача 11: сервер — `rights` в списке тем и проверки дублирования

**Files:**

- Modify: `server/services/topic-access.ts` (новая функция после `manageableTopicScope`)
- Modify: `server/routes/topics.ts` (импорты, `GET /` около строки 77, `POST /:id/duplicate` около строки 653)
- Modify: `server/routes/questions.ts` (`POST /:id/duplicate` около строки 778)
- Test: `tests/routes.topic-access.test.ts`

- [ ] **Шаг 1: падающие тесты**

В `storageMock` файла `tests/routes.topic-access.test.ts` добавить:

```ts
    getQuestion: vi.fn(),
    duplicateQuestion: vi.fn(),
    duplicateTopicWithQuestions: vi.fn(),
```

После `vi.mock("../server/scorm-exporter", ...)` добавить (индекс медиатеки не нужен этим проверкам):

```ts
vi.mock("../server/services/media/usage-index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/services/media/usage-index")>()),
  syncEntityUsages: vi.fn(),
}));
```

В `beforeEach` добавить:

```ts
  storageMock.getQuestion.mockImplementation(async (id: string) =>
    ({ qA: { id: "qA", topicId: "t1" }, qB: { id: "qB", topicId: "t2" }, qC: { id: "qC", topicId: "tS" } } as Record<string, unknown>)[id],
  );
  storageMock.duplicateQuestion.mockImplementation(async (id: string) => ({ id: `${id}-copy` }));
  storageMock.duplicateTopicWithQuestions.mockImplementation(async (id: string) => ({
    topic: { id: `${id}-copy`, feedbackJson: null },
    questions: [],
  }));
```

В конец файла добавить блоки:

```ts
// ─── GET /api/topics — per-topic rights (role-model 6.6) ─────────────────────

describe("GET /api/topics — every row carries the reader's rights", () => {
  it("gives the owner every right and a shared legacy topic none", async () => {
    const res = await asAuthor1(request(makeApp()).get("/api/topics"));
    const byId = Object.fromEntries(res.body.map((t: { id: string; rights: unknown }) => [t.id, t.rights]));
    expect(byId.t1).toEqual({ manage: true, delete: true, grant: true });
    expect(byId.tS).toEqual({ manage: false, delete: false, grant: false });
  });

  it("gives a manage grant the content but neither deletion nor access", async () => {
    storageMock.getActiveTopicGrantsForGrantees.mockResolvedValue([{ topicId: "t2", accessLevel: "manage" }]);
    const res = await asAuthor1(request(makeApp()).get("/api/topics"));
    const t2Row = res.body.find((t: { id: string }) => t.id === "t2");
    expect(t2Row.rights).toEqual({ manage: true, delete: false, grant: false });
  });

  it("gives a use grant nothing beyond reading", async () => {
    storageMock.getActiveTopicGrantsForGrantees.mockResolvedValue([{ topicId: "t2", accessLevel: "use" }]);
    const res = await asAuthor1(request(makeApp()).get("/api/topics"));
    const t2Row = res.body.find((t: { id: string }) => t.id === "t2");
    expect(t2Row.rights).toEqual({ manage: false, delete: false, grant: false });
  });

  it("gives an administrator every right on every topic", async () => {
    const res = await asAdmin(request(makeApp()).get("/api/topics"));
    for (const row of res.body) expect(row.rights).toEqual({ manage: true, delete: true, grant: true });
  });
});

// ─── Duplicates are writes / reads of a specific topic (role-model 6.6, §9) ──

describe("POST /api/questions/:id/duplicate — the copy is a write into the question's topic", () => {
  it("refuses a question of a topic the author may not manage (403)", async () => {
    const res = await asAuthor1(request(makeApp()).post("/api/questions/qC/duplicate"));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("content_forbidden");
    expect(storageMock.duplicateQuestion).not.toHaveBeenCalled();
  });

  it("duplicates a question of the author's own topic (201)", async () => {
    const res = await asAuthor1(request(makeApp()).post("/api/questions/qA/duplicate"));
    expect(res.status).toBe(201);
    expect(storageMock.duplicateQuestion).toHaveBeenCalledWith("qA");
  });

  it("answers 404 for an unknown question", async () => {
    const res = await asAuthor1(request(makeApp()).post("/api/questions/nope/duplicate"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/topics/:id/duplicate — the source must be visible", () => {
  it("answers 404 for a topic outside the author's scope and copies nothing", async () => {
    const res = await asAuthor1(request(makeApp()).post("/api/topics/t2/duplicate"));
    expect(res.status).toBe(404);
    expect(storageMock.duplicateTopicWithQuestions).not.toHaveBeenCalled();
  });

  it("duplicates a visible shared topic into the author's own copy (201)", async () => {
    const res = await asAuthor1(request(makeApp()).post("/api/topics/tS/duplicate"));
    expect(res.status).toBe(201);
    expect(storageMock.duplicateTopicWithQuestions).toHaveBeenCalledWith("tS", "author1");
  });
});
```

Run: `npm test -- tests/routes.topic-access.test.ts`
Expected: FAIL в новых блоках: у строк нет `rights`, дублирование чужого вопроса отвечает `201`, дублирование
невидимой темы отвечает `201`.

- [ ] **Шаг 2: функция прав для строки**

В `server/services/topic-access.ts` расширить импорт `@shared/access` типом `TopicRights` и после
`manageableTopicScope` добавить:

```ts
/**
 * Per-topic rights for a row of the topic list (role-model.md 6.6) — the same predicates the
 * routes guard with, so a screen never offers what the server refuses. `manageable` is
 * {@link manageableTopicScope}, read once per list instead of once per row.
 *
 * @param roles - the reader's effective roles.
 * @param userId - the reader's id.
 * @param topic - the row's topic.
 * @param manageable - the reader's manageable scope.
 * @returns the reader's rights on that topic.
 */
export function topicRightsFor(
  roles: readonly Role[],
  userId: string,
  topic: TopicRef,
  manageable: { all: boolean; ids: Set<string> },
): TopicRights {
  return {
    manage: manageable.all || manageable.ids.has(topic.id),
    delete: canDeleteTopic(roles, userId, topic),
    grant: canGrantTopicAccess(roles, userId, topic),
  };
}
```

`manageableTopicScope` даёт тот же ответ, что `canManageTopicContent` (владелец, грант `manage`, AD/SU), но одним
чтением грантов на весь список.

- [ ] **Шаг 3: `rights` в `GET /api/topics`**

В импорт из `../services/topic-access` в `server/routes/topics.ts` добавить `manageableTopicScope`,
`topicRightsFor` и `visibleTopic`. Обработчик `GET /`:

```ts
router.get("/", requirePermission("topics.read"), async (req, res) => {
  try {
    const roles = req.effectiveRoles ?? [];
    const userId = req.currentUser?.id ?? "";
    const scope = await visibleTopicScope(roles, userId);
    // role-model.md 6.6: each row says what the reader may do with it, so the bank hides what
    // the server would refuse.
    const manageable = await manageableTopicScope(roles, userId);
    const allTopics = await storage.getTopics();
    const topics = scope.all ? allTopics : allTopics.filter((t) => scope.ids.has(t.id));
    const topicsWithDetails = await Promise.all(
      topics.map(async (topic) => {
        const questions = await storage.getQuestionsByTopic(topic.id);
        return {
          ...topic,
          // TD-02 r.3: recommended courses/events are derived from the topic's
          // feedback (no extra queries; the legacy tables are no longer read).
          courses: topicCoursesFromFeedback(topic),
          events: topicEventsFromFeedback(topic),
          questionCount: questions.length,
          rights: topicRightsFor(roles, userId, topic, manageable),
        };
      })
    );
    res.json(topicsWithDetails);
```

(хвост обработчика без изменений).

- [ ] **Шаг 4: дублирование темы**

В начало `try` обработчика `POST /:id/duplicate` в `server/routes/topics.ts`, перед
`storage.duplicateTopicWithQuestions`:

```ts
    // role-model.md §9: the source must be in the reader's visible scope. An invisible topic
    // answers like a missing one, so the route does not confirm it exists.
    const source = await storage.getTopic(req.params.id);
    if (!source || !(await visibleTopic(req.effectiveRoles ?? [], req.currentUser?.id ?? "", source))) {
      return res.status(404).json({ error: "Topic not found" });
    }
```

- [ ] **Шаг 5: дублирование вопроса**

В начало `try` обработчика `POST /:id/duplicate` в `server/routes/questions.ts`, перед
`storage.duplicateQuestion`:

```ts
      const original = await storage.getQuestion(req.params.id);
      if (!original) {
        return res.status(404).json({ error: "Question not found" });
      }
      // The copy lands in the SAME topic, so duplicating is a write into that topic
      // (role-model.md 6.6) — the same gate as creating a question there.
      if (!(await canManageQuestion(req, original.topicId))) {
        respondForbiddenContent(res);
        return;
      }
```

- [ ] **Шаг 6: тесты проходят**

Run:

```bash
npm test -- tests/routes.topic-access.test.ts tests/routes.topics.coverage.test.ts tests/routes.topics-folders-bulk.test.ts tests/routes.topics-folders-groups.test.ts tests/routes.questions.coverage.test.ts tests/media-usage-on-bulk-paths.test.ts
```

Expected: PASS. Тест, который дублирует вопрос или тему через подменённое хранилище без `getQuestion` или
`getTopic`, теперь получит `404`: добавить в его подмену `getQuestion` / `getTopic`, возвращающие тот же объект,
что `duplicateQuestion` / `duplicateTopicWithQuestions` берёт за исходный. Ожидания теста не ослаблять.

- [ ] **Шаг 7: коммит (только по разрешению)**

```bash
git add server/services/topic-access.ts server/routes/topics.ts server/routes/questions.ts tests/
git commit -m "fix(access): права на тему в списке тем, проверки дублирования вопроса и темы"
```

---

### Задача 12: банк «Темы и вопросы» — действия по правам

**Files:**

- Modify: `client/src/features/content/content-tree.tsx` (импорты; рядом с `canAnalytics`, строка около 293;
  ссылка из аналитики, строка около 494; меню темы 751-758; меню вопроса 827-834; панели выбора 958-1005;
  меню создания 1065-1070; `QuestionEditorDrawer` 1084-1093; окно переноса вопросов 1132)
- Create: `client/src/features/content/__tests__/content-tree-rights.test.tsx`
- Modify: фикстуры тем в `client/src/features/content/__tests__/content-tree.test.tsx`,
  `content-tree-branches.test.tsx`, `content-tree-extra.coverage.test.tsx`

- [ ] **Шаг 1: падающий тест**

Обвязка (подмены модулей, `stubFetch`, `renderTree`) повторяет `content-tree.test.tsx`; роль открывает всё
(`can: () => true`), решает тема.

```tsx
/**
 * @module features/content/__tests__/content-tree-rights.test
 * @description The bank tree offers only what the server accepts (role-model.md 6.6): a
 * single-object action without the right on its topic is hidden, a group action that applies
 * to nothing selected is disabled, and a row without `rights` grants nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { FULL_TOPIC_RIGHTS, NO_TOPIC_RIGHTS } from "@shared/access";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ can: () => true, hasRole: () => false, user: { id: "u1", name: "Author" } }),
}));
vi.mock("@/features/content-protection/use-content-guard", () => ({
  useContentGuard: () => ({ guard: vi.fn(), dialogProps: { open: false } }),
}));
vi.mock("@/features/content-protection/content-impact-dialog", () => ({ ContentImpactDialog: () => null }));
vi.mock("@/features/questions/question-editor-drawer", () => ({
  QuestionEditorDrawer: ({ open, topics }: { open: boolean; topics: Array<{ id: string }> }) =>
    (open ? <div data-testid="mock-question-editor" data-topics={topics.map((t) => t.id).join(",")} /> : null),
}));
vi.mock("@/features/topics/topic-drawer", () => ({ TopicDrawer: () => null }));
vi.mock("@/features/content/question-preview", () => ({ QuestionPreview: () => <div data-testid="mock-qpreview" /> }));
vi.mock("@/components/folder-tree-select", () => ({ FolderTreeSelect: () => null }));
vi.mock("@/features/content/bulk-content-ops", () => ({
  GroupMoveModal: () => null,
  GroupAccessModal: () => null,
  FolderDeleteDialog: () => null,
  GroupDeleteFlow: () => null,
}));

import { ContentTree } from "../content-tree";

const topics = [
  { id: "t-own", name: "Своя", folderId: null, ownerId: "u1", visibility: "private", rights: FULL_TOPIC_RIGHTS },
  { id: "t-use", name: "Чужая", folderId: null, ownerId: "u2", visibility: "private", rights: NO_TOPIC_RIGHTS },
  { id: "t-bare", name: "Без прав", folderId: null, ownerId: "u2", visibility: "shared" },
];
const questions = [
  { id: "q-own", topicId: "t-own", type: "single", prompt: "Свой вопрос", difficulty: null, tags: [], createdBy: "u1" },
  { id: "q-use", topicId: "t-use", type: "single", prompt: "Чужой вопрос", difficulty: null, tags: [], createdBy: "u2" },
];

function renderTree() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u === "/api/topics" ? topics : u === "/api/questions" ? questions : [];
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ContentTree />
    </QueryClientProvider>,
  );
}

async function openTopicMenu(name: string) {
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
  fireEvent.click(within(rowOf(name)).getByLabelText("Действия темы"));
}

/** The tree row that shows the given text. */
function rowOf(text: string): HTMLElement {
  return screen.getByText(text).closest(".ct-row") as HTMLElement;
}

beforeEach(() => { window.history.replaceState(null, "", "/"); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<ContentTree /> — topic actions follow the topic's rights", () => {
  it("offers everything on the reader's own topic", async () => {
    renderTree();
    await openTopicMenu("Своя");
    expect(screen.getByTestId("ct-topic-addq-t-own")).toBeInTheDocument();
    expect(screen.getByText("Настройки темы…")).toBeInTheDocument();
    expect(screen.getByText("Доступ…")).toBeInTheDocument();
    expect(screen.getByText("Удалить тему")).toBeInTheDocument();
  });

  it("leaves only the export on a topic without rights", async () => {
    renderTree();
    await openTopicMenu("Чужая");
    expect(screen.getByTestId("ct-topic-export-t-use")).toBeInTheDocument();
    expect(screen.queryByTestId("ct-topic-addq-t-use")).toBeNull();
    expect(screen.queryByText("Настройки темы…")).toBeNull();
    expect(screen.queryByText("Доступ…")).toBeNull();
    expect(screen.queryByText("Переместить в папку…")).toBeNull();
    expect(screen.queryByText("Удалить тему")).toBeNull();
  });

  it("treats a row without rights as a row without rights", async () => {
    renderTree();
    await openTopicMenu("Без прав");
    expect(screen.queryByTestId("ct-topic-addq-t-bare")).toBeNull();
  });
});

describe("<ContentTree /> — question actions follow the topic's rights", () => {
  it("hides editing, duplicating, moving and deleting a question of a topic without rights", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Чужая")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Чужая"));
    fireEvent.click(within(rowOf("Чужой вопрос")).getByLabelText("Действия вопроса"));
    expect(screen.queryByTestId("ct-q-edit-q-use")).toBeNull();
    expect(screen.queryByText("Дублировать")).toBeNull();
    expect(screen.queryByText("Переместить в тему…")).toBeNull();
    // analytics.read is granted by the mocked role, so the menu itself stays.
    expect(screen.getByTestId("ct-q-stats-q-use")).toBeInTheDocument();
  });

  it("keeps them on the reader's own question", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Своя")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Своя"));
    fireEvent.click(within(rowOf("Свой вопрос")).getByLabelText("Действия вопроса"));
    expect(screen.getByTestId("ct-q-edit-q-own")).toBeInTheDocument();
    expect(screen.getByText("Дублировать")).toBeInTheDocument();
  });

  it("disables moving a selection that holds a question of a topic without rights", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Своя")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Своя"));
    fireEvent.click(screen.getByText("Чужая"));
    fireEvent.click(within(rowOf("Свой вопрос")).getByLabelText("Выбрать вопрос"));
    expect(screen.getByTestId("ct-bulk-move-questions")).not.toBeDisabled();
    fireEvent.click(within(rowOf("Чужой вопрос")).getByLabelText("Выбрать вопрос"));
    expect(screen.getByTestId("ct-bulk-move-questions")).toBeDisabled();
  });

  it("offers only manageable topics as the topic of a new question", async () => {
    renderTree();
    await openTopicMenu("Своя");
    fireEvent.click(screen.getByTestId("ct-topic-addq-t-own"));
    expect(screen.getByTestId("mock-question-editor").getAttribute("data-topics")).toBe("t-own");
  });
});

describe("<ContentTree /> — group actions", () => {
  it("disables access, move and delete when no selected topic allows them", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Чужая")).toBeInTheDocument());
    fireEvent.click(within(rowOf("Чужая")).getByLabelText("Выбрать тему для экспорта"));
    expect(screen.getByTestId("ct-group-access")).toBeDisabled();
    expect(screen.getByTestId("ct-group-move")).toBeDisabled();
    expect(screen.getByTestId("ct-group-delete")).toBeDisabled();
    expect(screen.getByTestId("ct-export-topics")).not.toBeDisabled();
  });

  it("keeps them enabled when at least one selected topic allows them", async () => {
    renderTree();
    await waitFor(() => expect(screen.getByText("Своя")).toBeInTheDocument());
    for (const name of ["Своя", "Чужая"]) {
      fireEvent.click(within(rowOf(name)).getByLabelText("Выбрать тему для экспорта"));
    }
    expect(screen.getByTestId("ct-group-access")).not.toBeDisabled();
    expect(screen.getByTestId("ct-group-move")).not.toBeDisabled();
    expect(screen.getByTestId("ct-group-delete")).not.toBeDisabled();
  });
});
```

Run: `npm test -- client/src/features/content/__tests__/content-tree-rights.test.tsx`
Expected: FAIL: у чужой темы видны «Настройки темы…» и «Удалить тему», у чужого вопроса — «Редактировать…»,
`ct-bulk-move-questions` не найден.

- [ ] **Шаг 2: права в дереве**

Импорты:

```tsx
import { NO_TOPIC_RIGHTS, rightsOfTopic, type TopicRights } from "@shared/access";
```

Рядом с `const canAnalytics = can("analytics.read");`:

```tsx
  // role-model.md 6.6: the role opens an action in principle, the topic decides. A row
  // without `rights` grants nothing.
  const rightsById = useMemo(
    () => new Map(topics.map((tp) => [tp.id, rightsOfTopic(tp)] as const)),
    [topics],
  );
  const rightsFor = useMemo(
    () => (topicId: string | null | undefined): Readonly<TopicRights> =>
      (topicId ? rightsById.get(topicId) : undefined) ?? NO_TOPIC_RIGHTS,
    [rightsById],
  );
  const manageableTopics = useMemo(() => topics.filter((tp) => rightsOfTopic(tp).manage), [topics]);
  const topicOfQuestion = useMemo(() => new Map(questions.map((q) => [q.id, q.topicId] as const)), [questions]);
  // Moving goes question by question, so ONE question without the right would stop it midway.
  const selectedQuestionsMovable = useMemo(
    () => Array.from(selected).every((id) => rightsFor(topicOfQuestion.get(id)).manage),
    [selected, rightsFor, topicOfQuestion],
  );
```

`rightsFor` объявить до эффекта ссылки из аналитики (строка около 467), иначе он не попадёт в его зависимости.

- [ ] **Шаг 3: ссылка из аналитики**

Строку `setEditorTarget({ question: q });` в конце эффекта ссылки заменить на:

```tsx
    // role-model.md 6.6: without the right on its topic the question opens as a row, not in an
    // editor whose save the server would refuse.
    if (rightsFor(q.topicId).manage) setEditorTarget({ question: q });
    else setExpandedQuestions((prev) => new Set(prev).add(q.id));
```

и добавить `rightsFor` в массив зависимостей эффекта.

- [ ] **Шаг 4: меню темы**

```tsx
        {(() => {
          const tr = rightsFor(topic.id);
          return (
            <RowActions open={menuOpen} label={t.content.actionsTopic} onToggle={() => setMenu(menuOpen ? null : { kind: "topic", id: topic.id })}>
              {can("questions.manage") && tr.manage && <MenuItem icon={<Plus size={16} />} onClick={() => { setMenu(null); setEditorTarget({ question: null, defaultTopicId: topic.id }); }} testId={`ct-topic-addq-${topic.id}`}>{t.content.addQuestion}</MenuItem>}
              {can("questions.importExport") && <MenuItem icon={<Download size={16} />} onClick={() => { setMenu(null); exportTopicsToExcel([topic.id]); }} testId={`ct-topic-export-${topic.id}`}>{t.content.exportToExcel}</MenuItem>}
              {can("topics.manage") && tr.manage && <MenuItem icon={<Pencil size={16} />} onClick={() => { setMenu(null); setTopicTab("props"); setTopicTarget({ mode: "edit", topic }); }}>{t.content.topicSettings}</MenuItem>}
              {can("topics.access.grant") && tr.grant && <MenuItem icon={<KeyRound size={16} />} onClick={() => { setMenu(null); setTopicTab("access"); setTopicTarget({ mode: "edit", topic }); }}>{t.content.topicAccess}</MenuItem>}
              {can("topics.manage") && tr.manage && <MenuItem icon={<Move size={16} />} onClick={() => { setMenu(null); setMoveTopicTarget({ id: topic.id, folderId: topic.folderId ?? "" }); }}>{t.content.moveTopicToFolder}</MenuItem>}
              {can("topics.manage") && tr.delete && <MenuItem danger icon={<Trash2 size={16} />} onClick={() => { setMenu(null); setDeleteTopicIds([topic.id]); }}>{t.content.deleteTopic}</MenuItem>}
            </RowActions>
          );
        })()}
```

Если в функции строки темы уже есть локальные переменные, `tr` объявить там же обычной `const` вместо
немедленно вызываемой функции. Пустое меню темы невозможно, пока у роли есть `questions.importExport`; если у
роли нет и его, а прав на тему нет, кнопку «⋯» не рисовать — тем же условием, что у вопроса в шаге 5.

- [ ] **Шаг 5: меню вопроса**

В функции строки вопроса перед `return`:

```tsx
    // role-model.md 6.6: every change of a question is a write into its topic.
    const canChangeQ = can("questions.manage") && rightsFor(q.topicId).manage;
    const hasQActions = canChangeQ || canAnalytics;
```

и меню:

```tsx
        {hasQActions && (
          <RowActions open={menuOpen} label={t.content.actionsQuestion} onToggle={() => setMenu(menuOpen ? null : { kind: "question", id: q.id })}>
            {canChangeQ && <MenuItem icon={<Pencil size={16} />} onClick={() => { setMenu(null); setEditorTarget({ question: q }); }} testId={`ct-q-edit-${q.id}`}>{t.content.editQuestion}</MenuItem>}
            {/* PRD-70 FR-25: статистика вопроса по всем тестам читателя. */}
            {canAnalytics && <MenuItem icon={<BarChart3 size={16} />} onClick={() => { setMenu(null); openStatistics(q.id); }} testId={`ct-q-stats-${q.id}`}>Статистика</MenuItem>}
            {canChangeQ && <MenuItem icon={<Copy size={16} />} onClick={() => { setMenu(null); duplicateQuestionMut.mutate(q.id); }}>{t.questions.duplicate}</MenuItem>}
            {canChangeQ && <MenuItem icon={<Move size={16} />} onClick={() => { setMenu(null); setMoveQ({ ids: [q.id], topicId: q.topicId }); }}>{t.content.moveQuestionToTopic}</MenuItem>}
            {canChangeQ && <MenuItem danger icon={<Trash2 size={16} />} onClick={() => { setMenu(null); deleteQuestion(q); }}>{t.content.deleteSelected}</MenuItem>}
          </RowActions>
        )}
```

Если без кнопки «⋯» строка вопроса теряет выравнивание колонок (кнопка занимает последнюю колонку сетки
`.ct-row`), на её месте оставить пустой `<div className="ct-acts" />`. Проверить это на скриншоте задачи 16.

- [ ] **Шаг 6: панели выбора**

Панель вопросов, кнопка переноса:

```tsx
            <Button
              variant="secondary"
              size="s"
              leadingIcon={<Move size={16} />}
              disabled={!selectedQuestionsMovable}
              onClick={() => setMoveQ({ ids: Array.from(selected), topicId: "" })}
              data-testid="ct-bulk-move-questions"
            >
              {t.content.moveSelected}
            </Button>
```

Панель тем и папок: добавить `disabled` трём кнопкам, остальное без изменений.

```tsx
            disabled={selectedFolders.size === 0 && !resolvedTopicIds.some((id) => rightsFor(id).manage)}
```

для `ct-group-move` (у папок прав нет, их перенос открывает `folders.manage`);

```tsx
            disabled={!resolvedTopicIds.some((id) => rightsFor(id).grant)}
```

для `ct-group-access`;

```tsx
              disabled={selectedFolders.size === 0 && !resolvedTopicIds.some((id) => rightsFor(id).delete)}
```

для `ct-group-delete`.

- [ ] **Шаг 7: выбор темы-назначения**

- окно «Переместить вопросы»: `options={manageableTopics.map((tp) => ({ value: tp.id, label: tp.name }))}`;
- `<QuestionEditorDrawer ... topics={manageableTopics}`;
- меню создания: условие кнопки «Добавить вопрос» `can("questions.manage") && manageableTopics.length > 0`.

- [ ] **Шаг 8: фикстуры прежних тестов**

В `content-tree.test.tsx`, `content-tree-branches.test.tsx`, `content-tree-extra.coverage.test.tsx` каждой теме в
массивах `topics` (включая темы внутри отдельных тестов, например строки около 457 и 534 в
`content-tree.test.tsx`) добавить `rights: FULL_TOPIC_RIGHTS` и импорт
`import { FULL_TOPIC_RIGHTS } from "@shared/access";`. Эти тесты проверяют поведение при полных правах, и
отсутствие поля теперь значило бы «прав нет».

- [ ] **Шаг 9: тесты проходят**

Run: `npm test -- client/src/features/content/`
Expected: PASS.

- [ ] **Шаг 10: коммит (только по разрешению)**

```bash
git add client/src/features/content/
git commit -m "fix(content): банк не предлагает действий, которые сервер отклонит"
```

---

### Задача 13: ящик темы — вкладка «Доступ» только с правом

**Files:**

- Modify: `client/src/features/topics/topic-drawer.tsx` (около строк 150-215 и 366-369)
- Test: `client/src/features/topics/__tests__/topic-drawer.test.tsx`,
  `client/src/features/topics/__tests__/topic-drawer.branches.test.tsx`

- [ ] **Шаг 1: падающий тест**

В `topic-drawer.test.tsx` фикстуре `editTopic` добавить `rights: FULL_TOPIC_RIGHTS` (импорт из `@shared/access`)
и в блок `describe("<TopicDrawer />", ...)` добавить:

```tsx
  it("edit mode without the grant right: no «Доступ» tab and no access request", () => {
    renderWithClient(
      <TopicDrawer
        target={{ mode: "edit", topic: { ...editTopic, rights: { manage: true, delete: false, grant: false } } as Topic }}
        folders={[]}
        isAdmin={false}
        initialTab="access"
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText("Доступ")).not.toBeInTheDocument();
    expect(screen.getByTestId("input-topic-name")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/access"))).toBe(false);
  });
```

В `topic-drawer.branches.test.tsx` всем темам фикстур (строки около 104 и 112) добавить
`rights: FULL_TOPIC_RIGHTS`.

Run: `npm test -- client/src/features/topics/__tests__/`
Expected: FAIL в новом тесте: вкладка «Доступ» видна.

- [ ] **Шаг 2: реализация**

Импорт `import { rightsOfTopic } from "@shared/access";`. После `const topicId = topic?.id ?? null;`:

```tsx
  // role-model.md 6.6: the «Доступ» tab reads and changes visibility and grants — the owner's
  // and the administrator's business. Without the right its request would only answer 403.
  const canGrant = isEdit && rightsOfTopic(topic).grant;
```

В эффекте сброса черновика:

```tsx
    setTab(target.mode === "create" || !rightsOfTopic(target.mode === "edit" ? target.topic : null).grant ? "props" : initialTab);
```

Запросы пользователей и доступа: `enabled: open && canGrant` и `enabled: open && canGrant && !!topicId`
соответственно. Вкладки:

```tsx
  const tabItems = canGrant
    ? [{ id: "props" as const, label: "Свойства" }, { id: "access" as const, label: "Доступ" }]
    : [{ id: "props" as const, label: "Свойства" }];
```

Условие панели `{tab === "access" && isEdit && (` заменить на `{tab === "access" && canGrant && (`. Сохранение
видимости и владельца уже защищено проверкой `access &&`: без права запрос доступа не идёт, и `access` пуст.

- [ ] **Шаг 3: тесты проходят**

Run: `npm test -- client/src/features/topics/__tests__/`
Expected: PASS.

- [ ] **Шаг 4: коммит (только по разрешению)**

```bash
git add client/src/features/topics/
git commit -m "fix(topics): вкладка «Доступ» ящика темы только у владельца и администратора"
```

---

### Задача 14: ящик теста — тема нового вопроса

Ящик вопроса из ящика теста получает весь список тем. Выбрать в нём можно только тему с правом `manage`, как и в
банке.

**Files:**

- Modify: `client/src/features/tests/editor/test-editor.tsx` (два `QuestionEditorDrawer`, строки около 1085 и
  1095)

- [ ] **Шаг 1: отфильтровать темы**

Рядом с `reviewTopics`:

```tsx
  // role-model.md 6.6: a question can be placed only into a topic whose content the reader manages.
  const manageableReviewTopics = useMemo(
    () => (reviewTopics.data ?? []).filter((tp) => rightsOfTopic(tp).manage),
    [reviewTopics.data],
  );
```

В обоих `QuestionEditorDrawer` заменить `topics={reviewTopics.data ?? []}` на `topics={manageableReviewTopics}`.
Импорт `import { rightsOfTopic } from "@shared/access";` (если `@shared/access` уже импортируется, дописать в тот
же импорт).

- [ ] **Шаг 2: типы и тесты**

Run: `npx tsc --noEmit --incremental false`
Expected: exit 0.

Run: `npm test -- client/src/features/tests/editor/__tests__/test-editor.test.tsx client/src/features/tests/editor/__tests__/test-editor.branches.test.tsx`
Expected: PASS. Если тест открывает ящик вопроса и ждёт тему в списке, добавить его фикстуре темы
`rights: FULL_TOPIC_RIGHTS`.

- [ ] **Шаг 3: коммит (только по разрешению)**

```bash
git add client/src/features/tests/editor/test-editor.tsx client/src/features/tests/editor/__tests__/
git commit -m "fix(editor): новый вопрос из ящика теста — только в тему с правом на содержимое"
```

---

### Задача 15: документация

**Files:**

- Modify: `docs/guides/test-authoring-guide.md` (раздел «3.2. Доступ к теме»)
- Modify: `docs/reports/ANALYSIS_WEBTUTOR_ISPRING.md` (строки около 71 и 239)
- Modify: `CLAUDE.md` (список роутеров в «Key Backend Components»)

- [ ] **Шаг 1: руководство автора**

В разделе 3.2 после абзаца «Отзыв доступа предлагает два режима…» вставить:

```markdown
Право на тест открывает и вопросы его тем. Если вам выдали доступ к тесту, а к его теме
доступа нет, в ящике этого теста вопросы темы всё равно видны: в «Вопросах теста», на
вкладке «Оценка», в вариантах, квотах и обратной связи. Править их нельзя: у таких
вопросов нет перехода в ящик вопроса и кнопки «Добавить вопрос», остаётся просмотр глазами
участника. В «Темах и вопросах» такая тема не появляется, и в другой тест её не добавить.

В «Темах и вопросах» видны только те действия, которые вам разрешены именно в этой теме.
С уровнем «Просмотр» можно читать вопросы, брать тему в свои тесты и выгружать её в Excel;
добавить, изменить, продублировать, перенести или удалить вопрос нельзя. С уровнем
«Управление» доступна правка содержимого и самой темы, но не её удаление и не вкладка
«Доступ»: это остаётся за владельцем и администратором. Если в выборе есть объекты, с
которыми действие невозможно, кнопка на панели выбора недоступна, когда оно невозможно ни
с одним из них; иначе действие выполнится там, где разрешено, а о пропущенных вы получите
сообщение. Перенос выбранных вопросов недоступен, если хоть один из них лежит в теме без
права «Управление».
```

- [ ] **Шаг 2: сравнительный анализ (только наша сторона)**

В строке «Владение контентом и объектные права на банк» заменить нашу ячейку:

```markdown
+ (с 2026-11-16 права на папку тестов наследуют все тесты внутри; с 2026-11-24 право на тест открывает чтение вопросов его тем без доступа к банку)
```

В строке «Владение и права на контент» нашу ячейку дополнить словами «, чтение тем в контексте теста».
Даты и цифры конкурентов не менять.

- [ ] **Шаг 3: CLAUDE.md**

В перечне роутеров `server/routes/` после `review (PRD-52),` дописать
`test-context-questions (вопросы тем теста в контексте теста, role-model 6.5.1),`.

- [ ] **Шаг 4: разметка**

Run: `npx markdownlint-cli2 docs/guides/test-authoring-guide.md docs/reports/ANALYSIS_WEBTUTOR_ISPRING.md CLAUDE.md docs/plans/2026-11-24-topic-read-in-test-context.md`
Expected: ошибок в изменённых строках нет.

- [ ] **Шаг 5: коммит (только по разрешению)**

```bash
git add docs/guides/test-authoring-guide.md docs/reports/ANALYSIS_WEBTUTOR_ISPRING.md CLAUDE.md
git commit -m "docs: чтение темы в контексте теста и права в банке в руководстве и анализе"
```

---

### Задача 16: приёмка в браузере

Под администратором ошибки прав не видны, поэтому проверка идёт под учёткой с одной ролью Автора. Данные
приёмки живут в общей dev-БД и убираются в шаге 6.

- [ ] **Шаг 1: свой экземпляр сервера**

Свободный порт выбрать по `netstat -ano | grep LISTENING` (8099 и 8097 бывают заняты чужими процессами).
Запуск из worktree: `PORT=<порт> npm run dev` в фоне. Готовность подтверждать строкой `serving on port <порт>`
в логе, а не кодом ответа.

- [ ] **Шаг 2: данные**

Под `acceptance@local.test` (администратор):

1. Создать приватную тему «Приёмка 6.5.1» (владелец — администратор) и два вопроса в ней.
2. Создать тест «Приёмка 6.5.1» с этой темой, вариантами и квотой.
3. Выдать `accept-author@local.test` грант `edit` на тест (`POST /api/tests/:id/access`). Грантов на тему не
   выдавать.

- [ ] **Шаг 3: сценарий под Автором**

Под `accept-author@local.test` (Playwright, скриншоты в `.playwright-mcp/`):

1. «Тесты» → открыть ящик теста → «Состав и сценарий» → тема в рейле: оба вопроса видны; у строк есть «Посмотреть
   глазами участника», нет «Открыть вопрос»; кнопки «Добавить вопрос» нет; окно просмотра открывается.
2. «Состав»: у темы признак «Тема недоступна», квота не сообщает о нехватке вопросов.
3. «Оценка»: вопросы темы видны.
4. «Обратная связь и итоги» → реестр обратной связи: переход к вопросу открывает окно просмотра, а не ящик
   вопроса.
5. Сохранить тест без изменений: сохранение проходит.
6. «Темы и вопросы»: темы «Приёмка 6.5.1» нет. `GET /api/questions` не содержит её вопросов.

- [ ] **Шаг 4: контроль с правом на содержимое**

Под администратором выдать Автору грант `manage` на тему. Под Автором обновить ящик: «Открыть вопрос» и
«Добавить вопрос» появились. Грант отозвать.

- [ ] **Шаг 5: контроль гейта**

Под `accept-manager@local.test`: `GET /api/tests/<id>/questions` отвечает `403`.

- [ ] **Шаг 6: банк под Автором**

Под администратором выдать Автору на тему «Приёмка 6.5.1» грант `use`. Под Автором в «Темах и вопросах»:

1. Меню темы: есть «Экспорт в Excel»; нет «Добавить вопрос», «Настройки темы…», «Доступ…», «Переместить в
   папку…», «Удалить тему».
2. Меню вопроса этой темы: нет «Редактировать…», «Дублировать», «Переместить в тему…», «Удалить».
3. Выбрать вопрос этой темы и вопрос своей темы: «Переместить…» на панели выбора недоступна. Снять чужой вопрос:
   доступна.
4. Выбрать флажком эту тему: «Доступ», «Переместить…» и «Удалить» на панели недоступны, «Экспорт в Excel»
   доступен. Добавить к выбору свою тему: кнопки доступны.
5. «Создать» → «Добавить вопрос»: в списке тем ящика вопроса этой темы нет.
6. Строки вопросов без кнопки «⋯» не сдвигают колонки (скриншот).

Затем заменить грант на `manage`: в меню темы появились «Добавить вопрос», «Настройки темы…» и «Переместить в
папку…», нет «Доступ…» и «Удалить тему»; ящик темы открывается без вкладки «Доступ»; у вопросов появились все
действия. Сверить с администратором, что под ним действия видны везде.

- [ ] **Шаг 7: дыры дублирования**

Под Автором с грантом `use`: `POST /api/questions/<id вопроса темы>/duplicate` отвечает `403`, в теме не появилось
копии. `POST /api/topics/<id чужой приватной темы без гранта>/duplicate` отвечает `404`.

- [ ] **Шаг 8: уборка**

Удалить тест, тему и выданные гранты. Остановить свой экземпляр сервера.

---

### Задача 17: итог

- [ ] **Шаг 1: целевой прогон всех затронутых тестов**

```bash
npm test -- shared/access/ server/services/__tests__/test-topic-context.test.ts tests/routes.test-context-questions.test.ts tests/routes.tests.test.ts tests/routes.topic-access.test.ts tests/routes.topics.coverage.test.ts tests/routes.questions.coverage.test.ts client/src/features/tests/editor/ client/src/features/content/ client/src/features/topics/
```

Expected: PASS.

- [ ] **Шаг 2: полный прогон — только по «да» владельца**

Спросить владельца, запускать ли `npm test` (около 8 минут). Без ответа не запускать и в отчёте прямо написать,
что полный прогон не выполнялся.

- [ ] **Шаг 3: отчёт владельцу**

Что изменено, какие тесты прошли, что показала приёмка (со ссылками на скриншоты), что осталось вне объёма.
