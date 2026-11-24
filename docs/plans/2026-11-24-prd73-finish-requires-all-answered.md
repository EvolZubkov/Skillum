# PRD-73 «Завершение только после ответа на все вопросы»: план реализации

> **Для исполнителя:** используйте superpowers:executing-plans (выполнение в этой же сессии, по задачам, с
> остановками на проверку). Субагенты запрещены владельцем проекта, поэтому subagent-driven-development не
> применяется. Шаги отмечены флажками `- [ ]`. Коммит делается только по явному разрешению владельца на коммит:
> шаги «Коммит» ниже подготавливают сообщение, а не разрешают его выполнить. Кода в плане нет по правилу
> владельца: задачи описывают файлы, правила, тексты и проверки с конкретными примерами.

**Цель:** настройка теста «Требовать ответ на все вопросы перед завершением». При ней кнопка «Завершить раздел» или
«Завершить тест» на экране обзора неактивна, пока в охвате остаётся вопрос без ответа, а подсказка объясняет почему.
Навигация внутри раздела (пропуск, возврат, свободный порядок) не меняется.

**Архитектура:** одно общее правило в `shared/flow/finish-gate.ts` и его вызов из общего построителя обзора
`buildReviewContext`, который оба хоста уже используют. Построитель отдаёт признак `review.finishBlocked` и текст
подсказки на место `review.hint`. Кнопки отключает ХОСТ, а не макет (подход А): после отрисовки общая функция
`disableActions` ставит `disabled` на элементы с запрещённым `data-action`, а обработчик действия запрет
проверяет повторно. Поэтому запрет работает и во внешних шаблонах без правки их макетов.

**Стек:** TypeScript, Express, Drizzle (одна аддитивная миграция), React 19 + `@skillum/ui-kit`, рантайм SCORM на
ES5 через бандл `TBTemplate`, Vitest. Новых зависимостей нет.

**Источники:** спецификация [PRD-73](../specs/prd-73/finish-requires-all-answered.md), согласованный эскиз
[prd73-finish-requires-all-answers.html](../wireframes/approved/prd73-finish-requires-all-answers.html)
(коммит `f3c06b7a`).

## Правила работы

- Работать в отдельном worktree от локального `main` (задача 0). `EnterWorktree` не использовать: он ветвится
  от устаревшего `origin/main`. Без junction на `node_modules` главной копии клиентские тесты в worktree не
  запустятся. Перед удалением worktree junction снимать командой `cmd /c rmdir "<worktree>\node_modules"`,
  а не `Remove-Item`: тот проходит по junction и удаляет `node_modules` главной копии.
- Тесты запускаются только целевыми файлами: `npm test -- <путь>`. Полный прогон и `test:cov` без отдельного «да»
  владельца не запускать.
- Типы проверять без общего кэша: `npx tsc --noEmit --incremental false`. `npm run check` в worktree может
  показать «чисто» по чужому дереву.
- Dev-база общая для всех сессий. Миграция аддитивная, `predev` применит её сам; руками `db:migrate` не нужен.
- UI сверяется с эскизом поэлементно (подписи дословно, вариант кнопки, место поля), а не по пунктам плана.
- Комментарии и JSDoc в коде пишутся на английском, у каждого нового модуля полный JSDoc с `@module`.

## Решения, принятые при разборе кода

Эти решения уточняют спецификацию там, где она описывает намерение, а код диктует способ.

1. **Отключение кнопок на вебе.** `TemplateScreen` перерисовывает сцену при каждой смене контекста, а
   `onShadowReady` вызывается один раз, поэтому отключать кнопки из него ненадёжно. `TemplateScreen` получает
   новое свойство `disabledActions` (список значений `data-action`) и применяет его сразу после отрисовки, рядом с
   `paintSceneTimers` и `attachQuestionMaps`. Свойство общее, а не «обзорное»: так же устроены таймеры и карта.
2. **Общая функция отключения.** `disableActions(root, actions)` в новом модуле
   `shared/template/action-disable.ts`, экспорт в `TBTemplate`. Её вызывают `TemplateScreen` и `renderReviewScreen`
   пакета: одна реализация на два хоста.
3. **Поле модели редактора необязательное.** `runtime.requireAllAnsweredToFinish?: boolean` в
   `test-editor.types.ts`. Файлы `*.test.tsx` входят в `tsc`, и обязательное поле потребовало бы правки около
   пятнадцати фикстур, не относящихся к задаче. Мапперы заполняют поле всегда, поэтому в рабочем коде оно есть.
   Прецедент — `showTopicResults?` и `showAttemptsCount?` в том же типе.
4. **Пакет без настройки не меняется.** В `TEST_DATA` поле выпекается только при истине, как `closeSectionOnLeave`:
   пакет теста, который настройки не касался, остаётся байт-в-байт прежним. Для адаптивного режима поле не
   выпекается вовсе (FR-09).
5. **Номер миграции и версии контракта берутся в момент работы.** Сейчас последняя миграция `0068`, контракт
   шаблонов 3.22.0, манифест «Стандартного» 1.28.2. Параллельные сессии могут занять следующие номера: перед
   генерацией и перед подъёмом версий сверить с `main`.
6. **Скрытый автором обзор (спецификация §3.5, FR-12).** Сегодня его скрытие читается напрямую: в вебе
   `wantsReview` (`take-test.tsx`, около строки 2054) — `!reviewScreenHidden && shouldShowReview(...)`, в пакете
   `reviewIsWorthShowing` (`mainRender.js`, около строки 240) — `screenHidden('review')` первым условием. Оба места
   переходят на `reviewHiddenByAuthor(hidden, input)` из `finish-gate.ts`. У веба на этом пути уже есть
   `hasUnanswered`, у пакета — `hasUnansweredInScope(topicId)`, оба считают и невыданные вопросы раздела.

## Вне объёма

- Проверка запрета на сервере при `finish` (спецификация §4.1).
- ~~Правка внешнего шаблона `standard-rt` в его репозитории~~ — пересмотрено при выполнении задачи 12: тесты
  паритета требуют макет `review`, совпадающий знак в знак у всех трёх шаблонов, и владелец 2026-11-24 решил
  править все три. Правка перенесена в репозитории «Сертификации» (1.35.0) и «Стандартного Ростелеком» (1.23.0).
- Отладчик PRD-18: отдельной вкладки для новой настройки не нужно, обзор в нём рисует тот же рантайм пакета.

## Карта файлов

Создаются:

| Файл | Ответственность |
| --- | --- |
| `shared/flow/finish-gate.ts` | Правило запрета `isFinishBlocked` и действующее скрытие обзора `reviewHiddenByAuthor` |
| `shared/flow/finish-gate.test.ts` | Таблица истинности обеих функций |
| `shared/template/action-disable.ts` | `disableActions(root, actions)`: `disabled` на элементы с запрещённым `data-action` |
| `shared/template/__tests__/action-disable.test.ts` | Поведение `disableActions` на DOM |
| `drizzle/0069_prd73_require_all_answered_to_finish.sql` + журнал и снимок `drizzle/meta` | Колонка `tests.require_all_answered_to_finish` (номер сверить, решение 5) |
| `tests/prd73-finish-requires-all-answered.test.ts` | Пакет: выпечка в `TEST_DATA`, обзор с запретом, клик по неактивной кнопке, скрытый обзор |

Меняются:

| Файл | Что меняется |
| --- | --- |
| `shared/schema.ts` | Колонка `requireAllAnsweredToFinish` рядом с `allowFreeSectionNavigation` |
| `tests/it/schema.sql` | Снимок DDL для pglite |
| `shared/template/context.ts` | `CtxReview.finishBlocked` |
| `shared/template/review-context.ts` | Входы `requireAllAnsweredToFinish`, `allowReturnToUnanswered`; выход `finishBlocked` и подсказка |
| `shared/template/review-context.test.ts` | Новые случаи |
| `shared/template/runtime-entry.ts` | Экспорт `isFinishBlocked`, `reviewHiddenByAuthor`, `disableActions` |
| `shared/template/__tests__/runtime-entry-exports.test.ts` | Три новых имени в `REQUIRED` |
| `server/routes/tests.ts` | zod-поле и перечисления в четырёх местах (строки около 197, 805, 911, 1310, 1389) |
| `server/services/test-settings.ts` | Тип (около строки 209) и запись с умолчанием `false` (около строки 414) |
| `server/routes/attempts.ts` | `prd19RuntimeSettings` (около строки 126) |
| `server/scorm/builders/test-json.ts` | `TEST_DATA` (около строки 361) |
| `server/utils/workbook-settings.ts` | Параметр листа «Настройки» (около строки 605) |
| `tests/workbook-settings.test.ts` | Круговой путь параметра |
| `client/src/features/tests/editor/test-editor.types.ts` | Поле модели и черновика (около строк 681 и 827) |
| `client/src/features/tests/editor/test-editor.mappers.ts` | Ответ сервера, умолчание нового теста, чтение, полезная нагрузка (около строк 120, 1314, 1455, 1558) |
| `client/src/features/tests/editor/__tests__/test-editor.mappers.test.ts` | Чтение и запись поля |
| `client/src/features/tests/editor/sections/basic-settings-section.tsx` | Переключатель в `NavigationPane`, сброс при выключении возврата |
| `client/src/features/tests/editor/sections/__tests__/basic-settings-section.test.tsx` | Переключатель, недоступность, сброс |
| `client/src/components/template-screen.tsx` | Свойство `disabledActions` |
| `client/src/components/__tests__/template-screen.test.tsx` | Применение `disabledActions` после каждой отрисовки |
| `client/src/pages/learner/take-test.tsx` | `navSettings`, ворота обзора, построитель обзора, `disabledActions`, защита `finish-review` |
| `client/src/pages/learner/__tests__/take-test.test.tsx` | Сценарии веба |
| `server/scorm/template/app/render/mainRender.js` | `reviewIsWorthShowing`, `renderReviewScreen` |
| `server/scorm/templates/default/layouts/review.html` | `id` подсказки, `aria-describedby`, `disabled` по `review.finishBlocked` |
| `server/scorm/templates/default/manifest.json` | Минорный подъём версии |
| `docs/specs/spec-template-platform.md`, `docs/guides/template-development.md`, `docs/dist/*.pdf` | Контракт: `review.finishBlocked` |
| `docs/guides/test-authoring-guide.md` | Раздел 9.1 «Навигация» |
| `docs/specs/prd-19/skip-return-navigation.md` | Ссылка из FR-09 на PRD-73 |
| `docs/reports/ANALYSIS_*.md`, `docs/ROADMAP.md` | Четвёртый слой документации и статус трека |

### Задача 0: worktree

- [ ] **Шаг 1: создать worktree от локального `main`**

Из главной копии: `git worktree add ../test-builder-prd73 -b feat/prd73-finish-requires-all-answered main`.
Ожидается: каталог `C:\Repositories\test-builder-prd73`, ветка от коммита `f3c06b7a` или новее.

- [ ] **Шаг 2: junction на `node_modules`**

В PowerShell: удалить пустой `node_modules` worktree, если он появился, и создать junction
`New-Item -ItemType Junction -Path "C:\Repositories\test-builder-prd73\node_modules" -Target
"C:\Repositories\test-builder\node_modules"`.

- [ ] **Шаг 3: перенести незакоммиченную правку спецификации**

Правка спецификации (§3.5, FR-12) лежит в рабочем дереве главной копии. Если владелец разрешил коммит до
задачи 0, её уже нет в рабочем дереве; иначе скопировать файл
`docs/specs/prd-73/finish-requires-all-answered.md` в worktree и закоммитить вместе с планом по разрешению.

- [ ] **Шаг 4: проверить окружение**

Запустить `npm test -- shared/flow/review-gate.test.ts` в worktree. Ожидается: 1 файл, все тесты зелёные.

### Задача 1: общее правило `finish-gate`

**Files:**

- Create: `shared/flow/finish-gate.ts`
- Create: `shared/flow/finish-gate.test.ts`

Модуль чистый, без импортов из хостов. Полный JSDoc с `@module shared/flow/finish-gate`: что решает модуль,
почему он рядом с `review-gate.ts`, что его импортируют оба хоста (пакет — через `TBTemplate`), ссылка на
PRD-73 §3 и §6.

Интерфейс:

- `FinishGateInput`: `requireAllAnsweredToFinish?: boolean`, `allowReturnToUnanswered?: boolean`,
  `hasUnanswered: boolean` (в охвате есть вопрос без отправленного ответа, невыданные тоже считаются).
- `isFinishBlocked(input)`: истина, когда `requireAllAnsweredToFinish` истинно, возврат не выключен явно
  (`allowReturnToUnanswered` отсутствует или истинно — умолчание PRD-19 «возврат включён», как в
  `shouldShowReview`) и `hasUnanswered` истинно.
- `reviewHiddenByAuthor(hidden, input)`: истина, когда `hidden` истинно и `isFinishBlocked(input)` ложно.

- [ ] **Шаг 1: тест — таблица истинности**

| Случай | `require` | `allowReturn` | `hasUnanswered` | `isFinishBlocked` |
| --- | --- | --- | --- | --- |
| Настройка включена, есть пропуски | `true` | `true` | `true` | `true` |
| Всё отвечено | `true` | `true` | `false` | `false` |
| Настройка выключена | `false` | `true` | `true` | `false` |
| Настройки нет в данных (старый пакет) | отсутствует | `true` | `true` | `false` |
| Возврат выключен (книга принесла противоречие) | `true` | `false` | `true` | `false` |
| Возврат не указан — умолчание «включён» | `true` | отсутствует | `true` | `true` |

Для `reviewHiddenByAuthor`:

| Случай | `hidden` | вход | Ожидается |
| --- | --- | --- | --- |
| Экран не скрыт | `false` | запрет действует | `false` |
| Скрыт, запрета нет (всё отвечено) | `true` | `require: true, hasUnanswered: false` | `true` |
| Скрыт, запрет действует | `true` | `require: true, allowReturn: true, hasUnanswered: true` | `false` |
| Скрыт, настройка выключена | `true` | `require: false, hasUnanswered: true` | `true` |

Названия тестов — по-русски, как в соседнем `review-gate.test.ts`.

- [ ] **Шаг 2: прогнать тест, убедиться, что он падает**

`npm test -- shared/flow/finish-gate.test.ts`. Ожидается: падение на импорте — модуля нет.

- [ ] **Шаг 3: реализовать модуль по правилам выше**

- [ ] **Шаг 4: прогнать тест**

`npm test -- shared/flow/finish-gate.test.ts`. Ожидается: все случаи зелёные.

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): общее правило запрета завершения и действующего скрытия обзора`.

### Задача 2: построитель обзора

**Files:**

- Modify: `shared/template/context.ts` (интерфейс `CtxReview`, около строки 620)
- Modify: `shared/template/review-context.ts`
- Modify: `shared/template/review-context.test.ts`

Правила:

- `CtxReview` получает поле `finishBlocked: boolean` с JSDoc: истина, пока завершение запрещено PRD-73; хост в
  этом случае сам ставит `disabled` на кнопки `finish-review`, поле дано макету для своего оформления.
- `BuildReviewContextInput` получает два необязательных поля: `requireAllAnsweredToFinish` и
  `allowReturnToUnanswered`, с JSDoc и ссылкой на PRD-73.
- Число вопросов без ответа в охвате считается по ВСЕМ вопросам `input.questions` охвата (тот же фильтр раздела,
  что и у списка), НЕ пропуская `delivered: false`. Без ответа — всё, чей статус не `answered`.
- `finishBlocked` = результат `isFinishBlocked` с `hasUnanswered` = «это число больше нуля».
- При `finishBlocked` подсказка: «Чтобы » + `finishLabel` со строчной первой буквой + «, ответьте на все
  вопросы. Осталось без ответа: N.». Так подпись «Завершить тест» сама даёт форму «завершить тест». Иначе
  подсказка прежняя: «Проверьте перед завершением. Неотвеченные засчитываются как неверные.» или «Все вопросы
  отвечены.».
- Список `unanswered`, счётчики `unansweredCount`, `answeredCount`, `total` не меняются.
- Шапку модуля дополнить строкой о PRD-73.

- [ ] **Шаг 1: тесты**

Фикстура — существующая `sectioned` (A: `a1`, `a2`; B: `b1`, `b2`) и новая с невыданными вопросами.

| Случай | Вход | Ожидается |
| --- | --- | --- |
| Пропуск в разделе | `a1` answered, `a2` skipped, раздел A, `require: true`, `allowReturn: true`, «Завершить раздел» | `finishBlocked: true`, подсказка «Чтобы завершить раздел, ответьте на все вопросы. Осталось без ответа: 1.» |
| Невыданные считаются | A: `a1` answered (выдан), `a2` skipped (выдан), `a3`, `a4` с `delivered: false` | `unansweredCount: 1`, в подсказке «Осталось без ответа: 3.» |
| Сплошной тест | `commitScope: "test"`, «Завершить тест», один без ответа | подсказка начинается с «Чтобы завершить тест, » |
| Чужой раздел не считается | раздел A отвечен целиком, в B без ответа | `finishBlocked: false`, подсказка «Все вопросы отвечены.» |
| Настройка выключена | как первый случай, `require: false` | `finishBlocked: false`, подсказка «Проверьте перед завершением. Неотвеченные засчитываются как неверные.» |
| Возврат выключен | как первый случай, `allowReturn: false` | `finishBlocked: false` |
| Вход без новых полей (старый вызов) | как в существующих тестах | `finishBlocked: false`, прежние подсказки |

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- shared/template/review-context.test.ts`. Ожидается: новые случаи красные, прежние зелёные.

- [ ] **Шаг 3: реализовать по правилам**

- [ ] **Шаг 4: прогнать**

`npm test -- shared/template/review-context.test.ts shared/flow/finish-gate.test.ts`. Ожидается: всё зелёное.

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): признак finishBlocked и подсказка в контексте обзора`.

### Задача 3: общее отключение действий и экспорт в `TBTemplate`

**Files:**

- Create: `shared/template/action-disable.ts`
- Create: `shared/template/__tests__/action-disable.test.ts`
- Modify: `shared/template/runtime-entry.ts` (рядом с экспортом `shouldShowReview`, около строки 190)
- Modify: `shared/template/__tests__/runtime-entry-exports.test.ts` (массив `REQUIRED`)

Правила `disableActions(root, actions)`:

- `root` — `ParentNode` (элемент, `ShadowRoot` или документ), `actions` — список значений `data-action`.
- Каждому элементу с `data-action` из списка: если у него есть свойство `disabled` (кнопка, поле ввода) —
  `disabled = true`; любому такому элементу — `aria-disabled="true"`. Ссылка `<a data-action>` из внешнего
  шаблона так тоже помечается, а клик по ней хост отсекает своей проверкой.
- Пустой список — ничего не делает. Элементы с другими действиями не трогаются.
- Модуль framework-free (совместим с бандлом пакета), полный JSDoc с `@module`.

- [ ] **Шаг 1: тесты**

| Случай | DOM | Вызов | Ожидается |
| --- | --- | --- | --- |
| Кнопка | `<button data-action="finish-review">` | `["finish-review"]` | `disabled === true`, `aria-disabled="true"` |
| Две кнопки макета | `finish-review` в подвале и вторая с тем же действием | `["finish-review"]` | обе отключены |
| Ссылка | `<a data-action="finish-review">` | `["finish-review"]` | `aria-disabled="true"` |
| Другие действия | `goto:3`, `review-back` | `["finish-review"]` | не тронуты |
| Пустой список | `finish-review` | `[]` | не тронута |
| Shadow DOM | кнопка внутри `attachShadow({ mode: "open" })` | корень — `ShadowRoot` | отключена |

В `runtime-entry-exports.test.ts` добавить в `REQUIRED`: `isFinishBlocked`, `reviewHiddenByAuthor`,
`disableActions` с комментарием «PRD-73».

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- shared/template/__tests__/action-disable.test.ts shared/template/__tests__/runtime-entry-exports.test.ts`.

- [ ] **Шаг 3: реализовать модуль и экспорты**

В `runtime-entry.ts` экспортировать `isFinishBlocked` и `reviewHiddenByAuthor` из `../flow/finish-gate` и
`disableActions` из `./action-disable`.

- [ ] **Шаг 4: прогнать те же файлы и `tests/scorm-runtime-exports.test.ts`**

Ожидается: всё зелёное (последний файл проверяет, что бандл собирается и отдаёт экспорты).

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): общее отключение запрещённых действий экрана`.

### Задача 4: колонка и миграция

**Files:**

- Modify: `shared/schema.ts` (таблица `tests`, после `allowFreeSectionNavigation`, около строки 758)
- Create: `drizzle/0069_prd73_require_all_answered_to_finish.sql`, запись журнала и снимок в `drizzle/meta`
- Modify: `tests/it/schema.sql`

- [ ] **Шаг 1: колонка в схеме**

`requireAllAnsweredToFinish`, столбец `require_all_answered_to_finish`, `boolean`, `notNull`, `default(false)`.
Комментарий на английском в стиле соседей: PRD-73, кнопка завершения обзора неактивна, пока в охвате есть вопрос
без ответа; зависит от `allowReturnToUnanswered`; принудительные завершения (время, PRD-67) не ограничивает;
умолчание `false`, существующие тесты не меняются.

- [ ] **Шаг 2: сверить номер и сгенерировать миграцию**

Проверить, что в `main` нет миграции `0069` от другой сессии (`git log main --oneline -- drizzle/`). Затем
`npx drizzle-kit generate --name=prd73_require_all_answered_to_finish`. Ожидается файл с ровно одной командой
`ALTER TABLE "tests" ADD COLUMN "require_all_answered_to_finish" boolean DEFAULT false NOT NULL;`. Если drizzle
предложил что-то ещё — остановиться и разобраться, а не править файл руками.

- [ ] **Шаг 3: снимок pglite**

Команда `npx drizzle-kit export --sql`, из вывода убрать первую строку `DATABASE_URL:`, результат записать в
`tests/it/schema.sql`. Файл в репозитории с окончаниями CRLF: если `git diff --stat tests/it/schema.sql`
показывает переписанный файл, а не одну добавленную строку, вернуть окончания CRLF и сверить снова. В диффе —
только новая колонка.

- [ ] **Шаг 4: проверка**

`npm test -- tests/storage/schema-export-parity.test.ts` и `npx tsc --noEmit --incremental false`. Ожидается:
зелёный тест, ноль ошибок типов.

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): колонка tests.require_all_answered_to_finish`.

### Задача 5: проброс на сервере

**Files:**

- Modify: `server/routes/tests.ts`
- Modify: `server/services/test-settings.ts`
- Modify: `server/routes/attempts.ts`
- Modify: `server/scorm/builders/test-json.ts`
- Modify: `tests/routes.attempts.coverage.test.ts`
- Create: `tests/prd73-finish-requires-all-answered.test.ts` (первая часть — выпечка в пакет)

Правила (по образцу `closeSectionOnLeave` и `allowFreeSectionNavigation`):

- `routes/tests.ts`: в zod-схеме настроек `requireAllAnsweredToFinish` — необязательное булево (рядом с
  `closeSectionOnLeave`, около строки 197); в четырёх перечислениях (около строк 805, 911, 1310, 1389) поле
  разбирается и передаётся так же, как `closeSectionOnLeave`.
- `test-settings.ts`: необязательное поле в типе черновика, запись с умолчанием `false` для нового теста.
- `attempts.ts`, `prd19RuntimeSettings`: адаптивный тест — `false`; иначе значение теста, отсутствие в старом
  снимке публикации — `false`.
- `test-json.ts`: поле выпекается ТОЛЬКО при истине и не для адаптивного режима (решение 4).

- [ ] **Шаг 1: тесты**

В `tests/routes.attempts.coverage.test.ts` рядом с тестом «отдаёт свободную навигацию хосту, а адаптивному тесту
гасит её (FR-11b)» новый тест «отдаёт запрет завершения хосту, а адаптивному тесту гасит его (PRD-73)»:
стандартный тест с настройкой — в ответе старта `requireAllAnsweredToFinish` истинно; адаптивный с настройкой —
ложно; тест без поля — ложно.

В новом `tests/prd73-finish-requires-all-answered.test.ts` (фикстура `buildTestJson` — по образцу
`tests/prd19-free-section-navigation.test.ts`):

| Случай | Тест | Ожидается в `TEST_DATA` |
| --- | --- | --- |
| Включено | `requireAllAnsweredToFinish: true` | `requireAllAnsweredToFinish: true` |
| Выключено | `false` | поля нет |
| Отсутствует | поле не задано | поля нет |
| Адаптивный | `mode: "adaptive"`, `true` | поля нет |

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- tests/routes.attempts.coverage.test.ts tests/prd73-finish-requires-all-answered.test.ts`.

- [ ] **Шаг 3: реализовать проброс**

- [ ] **Шаг 4: прогнать те же файлы и типы**

`npx tsc --noEmit --incremental false` — ноль ошибок.

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): проброс настройки в API, попытку и пакет`.

### Задача 6: книга Excel и перенос

**Files:**

- Modify: `server/utils/workbook-settings.ts` (после «Позволить изменять ответ до завершения», около строки 604)
- Modify: `tests/workbook-settings.test.ts` (`ROUND_TRIP_SOURCE` около строки 53 и ожидание около строки 383)

- [ ] **Шаг 1: тест**

В `ROUND_TRIP_SOURCE` добавить `requireAllAnsweredToFinish: true`, в ожидание кругового пути — то же значение с
комментарием «PRD-73: параметр листа добавлен; прежние книги без него настройку не трогают». Отдельный случай:
лист без строки параметра даёт черновик без поля `requireAllAnsweredToFinish`.

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- tests/workbook-settings.test.ts`.

- [ ] **Шаг 3: параметр листа**

`boolParam` с подписью «Требовать ответ на все вопросы перед завершением» (дословно как в редакторе), уровень
`test`, ключ `requireAllAnsweredToFinish`. Перенос `.tbtest` использует тот же лист, отдельной правки не нужно.

- [ ] **Шаг 4: прогнать**

`npm test -- tests/workbook-settings.test.ts` — зелёный.

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): параметр листа «Настройки» книги Excel`.

### Задача 7: модель редактора

**Files:**

- Modify: `client/src/features/tests/editor/test-editor.types.ts` (около строк 681 и 827)
- Modify: `client/src/features/tests/editor/test-editor.mappers.ts` (около строк 120, 1314, 1455, 1558)
- Modify: `client/src/features/tests/editor/__tests__/test-editor.mappers.test.ts`

Правила:

- Тип модели: `runtime.requireAllAnsweredToFinish?: boolean` с JSDoc (решение 3 объясняет, почему поле
  необязательное). Тип черновика сохранения — то же необязательное поле.
- Ответ сервера (около строки 120): `requireAllAnsweredToFinish?: boolean | null`.
- Новый тест (около строки 1314): `false`.
- Чтение (около строки 1455): булево из ответа, иначе `false`.
- Полезная нагрузка (около строки 1558): значение модели, а при выключенном возврате — `false` (страховка к
  сбросу в интерфейсе, задача 8).

- [ ] **Шаг 1: тесты мапперов**

| Случай | Вход | Ожидается |
| --- | --- | --- |
| Ответ с полем `true` | ответ сервера | `model.runtime.requireAllAnsweredToFinish === true` |
| Ответ без поля | ответ до колонки | `false` |
| Новый тест | умолчания | `false` |
| Нагрузка | модель с `true` и возвратом | `payload.requireAllAnsweredToFinish === true` |
| Нагрузка без возврата | модель с `true`, `allowReturnToUnanswered: false` | `false` |

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- client/src/features/tests/editor/__tests__/test-editor.mappers.test.ts`.

- [ ] **Шаг 3: реализовать**

- [ ] **Шаг 4: прогнать тот же файл и типы**

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): настройка в модели редактора теста`.

### Задача 8: переключатель в «Навигации»

**Files:**

- Modify: `client/src/features/tests/editor/sections/basic-settings-section.tsx` (`NavigationPane`, около строки 1221)
- Modify: `client/src/features/tests/editor/sections/__tests__/basic-settings-section.test.tsx` (блок навигации,
  около строки 700)

Источник вида — эскиз, состояния `s-on` и `s-no-return`. Сверка поэлементная.

Правила:

- Поле стоит СРАЗУ под «Разрешить возврат к неотвеченным вопросам», перед «Свободной навигацией».
- Разметка — по образцу `CloseSectionOnLeaveField` (около строки 700): `div.ou-formfield` > `label.ou-switch-field`
  с `Switch size="m"`, `aria-label`, `data-testid="settings-require-all-answered-switch"` и текстом в
  `ou-switch-field__text`. Отдельный маленький компонент `RequireAllAnsweredField` с JSDoc, ссылкой на эскиз и
  PRD-73.
- Доступен (возврат включён): подпись «Требовать ответ на все вопросы перед завершением», под ней
  `ou-switch-field__desc` «Кнопка «Завершить раздел» или «Завершить тест» станет активной, когда ответ дан на
  каждый вопрос. Когда истекает время, раздел или тест завершается как обычно.» — описание одно, в обоих
  положениях переключателя.
- Недоступен (возврат выключен): `label` получает класс `is-disabled`, `Switch` — `disabled`, показан
  выключенным, описания нет; под полем `Banner tone="warning" size="sm" icon={false}` с текстом «Доступно только
  при включённом возврате к неотвеченным.».
- Обработчик «Разрешить возврат»: при выключении сбрасывает и `requireAllAnsweredToFinish` в `false`, как уже
  сбрасывает свободную навигацию и изменение ответа.

- [ ] **Шаг 1: тесты**

| Случай | Модель | Действие | Ожидается |
| --- | --- | --- | --- |
| Включение | возврат вкл, поле выкл | клик по переключателю | `runtime.requireAllAnsweredToFinish === true` |
| Подпись и описание | возврат вкл | — | видны подпись и описание дословно |
| Порядок | возврат вкл | — | переключатель идёт сразу после `settings-allow-return-checkbox` в DOM |
| Без возврата | возврат выкл, поле `true` | — | переключатель `disabled`, не отмечен, текст «Доступно только при включённом возврате к неотвеченным.» есть |
| Сброс | возврат вкл, поле `true` | клик по «Разрешить возврат» | `allowReturnToUnanswered === false`, `requireAllAnsweredToFinish === false` |

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- client/src/features/tests/editor/sections/__tests__/basic-settings-section.test.tsx`.

- [ ] **Шаг 3: реализовать**

- [ ] **Шаг 4: прогнать тот же файл и типы**

- [ ] **Шаг 5: сверка с эскизом в браузере**

Поднять `npm run dev` в worktree (порт сверить, чтобы не столкнуться с чужой сессией), открыть ящик теста →
«Правила прохождения» → «Навигация». Сверить с `s-on` и `s-no-return`: место поля, подпись и описание дословно,
баннер, его тон и отсутствие иконки. Снять скриншоты в светлой и тёмной теме в `.playwright-mcp/`.

- [ ] **Шаг 6: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): переключатель «Требовать ответ на все вопросы перед завершением»`.

### Задача 9: `TemplateScreen` отключает запрещённые действия

**Files:**

- Modify: `client/src/components/template-screen.tsx`
- Modify: `client/src/components/__tests__/template-screen.test.tsx`

Правила:

- Новое необязательное свойство `disabledActions?: readonly string[]` с JSDoc: действия, которые хост сейчас не
  исполнит; их элементы рисуются неактивными после каждой отрисовки сцены. Пример в JSDoc — кнопка завершения
  обзора при PRD-73.
- Применение — сразу после `paintSceneTimers(screen, …)` и `attachQuestionMaps(screen)` в эффекте отрисовки
  (около строки 432): `disableActions(screen, disabledActions ?? [])`.
- Список входит в `renderKey` (около строки 296), чтобы смена списка без смены контекста перерисовывала сцену.
  Сериализуется как массив строк.

- [ ] **Шаг 1: тесты**

| Случай | Макет и свойства | Ожидается |
| --- | --- | --- |
| Отключение | кнопка `data-action="finish-review"`, `disabledActions={["finish-review"]}` | в Shadow DOM кнопка `disabled` |
| Перерисовка | тот же список, контекст сменился дважды | после каждой смены кнопка `disabled` |
| Снятие | `rerender` со списком `[]` | кнопка активна |
| Без свойства | свойство не передано | кнопка активна, поведение прежнее |

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- client/src/components/__tests__/template-screen.test.tsx`.

- [ ] **Шаг 3: реализовать**

- [ ] **Шаг 4: прогнать тот же файл и типы**

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): TemplateScreen рисует запрещённые действия неактивными`.

### Задача 10: веб-хост

**Files:**

- Modify: `client/src/pages/learner/take-test.tsx`
- Modify: `client/src/pages/learner/__tests__/take-test.test.tsx`

Правила:

- `navSettings` (тип около строки 788, умолчание около 805): `requireAllAnsweredToFinish: boolean`, умолчание
  `false`; чтение при возобновлении (около 1315) и при старте (около 1546) с умолчанием `false`.
- Ворота обзора `wantsReview` (около строки 2054): вместо `!reviewScreenHidden` — отрицание
  `reviewHiddenByAuthor(reviewScreenHidden, { requireAllAnsweredToFinish, allowReturnToUnanswered,
  hasUnanswered })`, где два последних берутся из входа ворот. Комментарий: PRD-73 §3.5.
- Вызов `buildReviewContext` (около строки 3431): передать `requireAllAnsweredToFinish` и
  `allowReturnToUnanswered` из `navSettings`.
- `TemplateScreen` обзора (около строки 3466): `disabledActions` = `["finish-review"]` при
  `built.review.finishBlocked`, иначе пусто.
- Ветка `finish-review` в `onAction` (около строки 3508): первой строкой — выход без действия при
  `built.review.finishBlocked` (нет окна подтверждения, нет завершения). Комментарий: защита для шаблона, где
  действие висит не на кнопке.
- Двойник `TemplateScreen` в тесте (около строки 50) дополнить выводом `disabledActions` в
  `<pre data-testid="ts-disabled">`.

- [ ] **Шаг 1: тесты**

Новый `describe` «PRD-73: завершение только после ответа на все вопросы» рядом с «flexible flow». Попытка —
`standardAttempt` из файла с `allowReturnToUnanswered: true`, `requireAllAnsweredToFinish: true`,
`answerCommitScope: "test"`.

| Случай | Шаги | Ожидается |
| --- | --- | --- |
| Пропуск блокирует | старт → «Пропустить» на Q1 → ответ на Q2 → «Далее» до обзора | `ctx().review.finishBlocked === true`, подсказка содержит «Осталось без ответа: 1», `ts-disabled` содержит `finish-review` |
| Клик не завершает | там же клик по `ts-finish-review` | нет текста окна подтверждения, `navigateSpy` не вызван |
| Ответ снимает запрет | из обзора `goto` на Q1 → ответ → «Далее» до обзора | `finishBlocked === false`, клик по `ts-finish-review` ведёт на `/learner/result/attempt-1` без окна подтверждения |
| Настройка выключена | та же попытка без поля | пропуск → обзор → клик открывает окно подтверждения, как сегодня |
| Скрытый обзор, пропуски | в попытке `contentPages: [{ kind: "review", hidden: true, … }]` — структура приходит полем `attempt.contentPages`, образец поля — `routerAttempt` в `take-test-router-hub.test.tsx` | после последнего вопроса показан обзор с `finishBlocked === true` |
| Скрытый обзор, всё отвечено | тот же тест, оба вопроса отвечены | обзора нет, попытка завершается сразу |

Переход `goto` двойник не умеет: для третьего случая добавить в его список действий кнопку `goto:0` или вызвать
`props.onAction("goto:0")` через новую кнопку двойника `ts-goto-0`.

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- client/src/pages/learner/__tests__/take-test.test.tsx`.

- [ ] **Шаг 3: реализовать**

- [ ] **Шаг 4: прогнать тот же файл, соседние наборы веба и типы**

```text
npm test -- client/src/pages/learner/__tests__/take-test.test.tsx \
  client/src/pages/learner/__tests__/take-test-extra.coverage.test.tsx \
  client/src/pages/learner/__tests__/take-test-router-hub.test.tsx
npx tsc --noEmit --incremental false
```

Ожидается: всё зелёное — FR-11 (без настройки поведение прежнее).

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): запрет завершения на обзоре веб-хоста`.

### Задача 11: рантайм SCORM-пакета

**Files:**

- Modify: `server/scorm/template/app/render/mainRender.js`
- Modify: `tests/prd73-finish-requires-all-answered.test.ts` (вторая часть — поведение пакета)

Правила (ES5, как весь рантайм):

- `reviewIsWorthShowing(topicId)` (около строки 240): первое условие «экран скрыт» заменяется на «скрытие
  действует»: `TBTemplate.reviewHiddenByAuthor(screenHidden('review'), вход)`, где вход — `TEST_DATA.requireAllAnsweredToFinish`,
  `TEST_DATA.allowReturnToUnanswered` и `hasUnansweredInScope(topicId)`. Без бандла — то же правило встроенно, как
  уже сделано для `shouldShowReview` ниже в той же функции.
- `renderReviewScreen()` (около строки 328): в `TB.buildReviewContext` передать `requireAllAnsweredToFinish` и
  `allowReturnToUnanswered` из `TEST_DATA`; после `TB.renderScreenInto` при `built.review.finishBlocked` вызвать
  `TB.disableActions(app, ['finish-review'])`; в обработчике `finish-review` первой строкой — выход при
  `built.review.finishBlocked`.
- Запасной путь «No review layout» не меняется: это принудительное завершение (спецификация §3.4).

- [ ] **Шаг 1: тесты**

Во второй части `tests/prd73-finish-requires-all-answered.test.ts` функции извлекаются из исходника тем же
приёмом, что в `tests/scorm-review-finish.test.ts` (`extractTopLevel`), и исполняются над заглушками глобалов
рантайма. `window.TBTemplate` собирается из НАСТОЯЩИХ `renderScreenInto`, `buildReviewContext`,
`disableActions`, `isFinishBlocked`, `reviewHiddenByAuthor`, `shouldShowReview` из `shared/`. Макет обзора —
содержимое `server/scorm/templates/default/layouts/review.html` с диска.

| Случай | Состояние | Ожидается |
| --- | --- | --- |
| Обзор с запретом | раздел из Q1 (answered) и Q2 (skipped), `requireAllAnsweredToFinish: true` | кнопка `finish-review` в `#app` `disabled`; в тексте подсказка «Осталось без ответа: 1» |
| Защита клика | там же снять `disabled` вручную и кликнуть | `finishSection` и `showFinishConfirm` не вызваны |
| Отвечено всё | Q1 и Q2 answered | кнопка активна; клик вызывает `finishSection` |
| Без настройки | Q2 skipped, поля в `TEST_DATA` нет | кнопка активна; клик вызывает `finishSection` с числом 1 (окно подтверждения внутри него) |
| Скрытый обзор, пропуски | `screenHidden('review')` истинно, настройка включена, Q2 skipped | `reviewIsWorthShowing` возвращает `true` |
| Скрытый обзор, всё отвечено | то же, Q2 answered | `false` |
| Скрытый обзор без настройки | настройка выключена, Q2 skipped | `false` — прежнее поведение |

- [ ] **Шаг 2: прогнать, убедиться в падении**

`npm test -- tests/prd73-finish-requires-all-answered.test.ts`.

- [ ] **Шаг 3: реализовать**

- [ ] **Шаг 4: прогнать с соседями**

```text
npm test -- tests/prd73-finish-requires-all-answered.test.ts tests/scorm-review-finish.test.ts \
  tests/prd19-free-section-navigation.test.ts tests/runtime.question-nav-back.test.ts
```

Ожидается: всё зелёное.

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): запрет завершения на обзоре SCORM-пакета`.

### Задача 12: макет обзора «Стандартного»

**Files:**

- Modify: `server/scorm/templates/default/layouts/review.html`
- Modify: `server/scorm/templates/default/manifest.json`

Правила:

- Строка подсказки `tb-scene__qhint` получает `id="review-hint"`.
- Обе кнопки `data-action="finish-review"` (ghost при `review.canReturn`, primary без него) получают
  `aria-describedby="review-hint"` и `{{#if review.finishBlocked}}disabled{{/if}}` — тем же способом, каким
  макет уже гасит точки карты (`{{#unless clickable}}disabled{{/unless}}`). Вид кнопок и их порядок не меняются.
- `version` манифеста — минорный подъём (сейчас 1.28.2, сверить с `main`, решение 5).

- [ ] **Шаг 1: правка макета и манифеста**

- [ ] **Шаг 2: проверки шаблона**

`npm test -- tests/smoke-runner.test.ts tests/template-preview-path-markers.test.ts tests/prd73-finish-requires-all-answered.test.ts`
и `npm run scorm:template` (пакет приёмки собирается без ошибок валидации).

- [ ] **Шаг 3: коммит (по разрешению владельца)**

Сообщение: `feat(prd-73): макет обзора «Стандартного» связывает подсказку с кнопкой`.

### Задача 13: контракт шаблонов

**Files:**

- Modify: `docs/specs/spec-template-platform.md` (шапка: версия и дата; «История версий»; новый §10.15)
- Modify: `docs/guides/template-development.md` (версия в трёх местах: строки около 16, 39, 49; §7.5 `review.*`)
- Modify: `docs/dist/*.pdf` (пересборка)

- [ ] **Шаг 1: версия**

Сверить номер с `main` (решение 5). Ожидаемая версия — 3.23.0, МИНОРНАЯ: поле добавлено, прежние шаблоны
работают без правки.

- [ ] **Шаг 2: спецификация платформы**

Новая строка «Истории версий»: дата, «**Запрет завершения обзора: `review.finishBlocked`** (§10.15)», суть: пока
автор требует ответа на все вопросы и в охвате есть вопрос без ответа, хост рисует кнопки `finish-review`
неактивными и не исполняет их; подсказку приносит прежнее поле `review.hint`; новое поле нужно только для своего
оформления; поставляемый «Стандартный» (новая версия манифеста) связал подсказку с кнопкой через
`aria-describedby`.

Новый раздел §10.15 «Запрет завершения: `review.finishBlocked`» после §10.14, с таблицей поля и правилами:
хост отключает кнопки сам (макет без поля работает); подсказка — `review.hint`, текст ядра; принудительные
завершения (время, закрытие раздела при выходе) запретом не ограничены; макету не нужно прятать кнопку — она
видна неактивной. В шапке спецификации, в перечне «надписи и поля §10.x», добавить «запрет завершения на обзоре
— §10.15».

- [ ] **Шаг 3: руководство разработчика шаблонов**

Версия в трёх местах. В §7.5 в абзаце `review.*` добавить недостающие поля `canReturn`, `backLabel` и новое
`finishBlocked` с пояснением одной фразой и ссылкой на §10.15 спецификации.

- [ ] **Шаг 4: PDF и проверка разметки**

`npm run docs:pdf`. Первый запуск может упасть с ETIMEDOUT на запуске Chrome — повторить. Команда
пересобирает все PDF в `docs/dist/`: вернуть чужие (`git checkout -- docs/dist/<чужой>.pdf`), оставить только
PDF руководства и спецификации шаблонов. Затем `npx --no-install markdownlint-cli2` по двум изменённым файлам —
ноль замечаний.

- [ ] **Шаг 5: коммит (по разрешению владельца)**

Сообщение: `docs(prd-73): контракт шаблонов 3.23.0 — review.finishBlocked`.

### Задача 14: остальная документация

**Files:**

- Modify: `docs/guides/test-authoring-guide.md` (§9.1 «Навигация», около строки 1190)
- Modify: `docs/specs/prd-19/skip-return-navigation.md` (FR-09 и строка «Связанные документы»)
- Modify: `docs/reports/ANALYSIS_STARTEXAM_MATRIX.md` и другие `ANALYSIS_*.md`, где есть строка про пропуск и
  возврат (найти поиском «возврат к неотвеч» и «allowReturnToUnanswered»)
- Modify: `docs/ROADMAP.md`
- Modify: `docs/specs/prd-73/finish-requires-all-answered.md` (статус, отметки §10)

- [ ] **Шаг 1: руководство автора**

В список §9.1 после «Разрешить возврат…» пункт «**Требовать ответ на все вопросы перед завершением** — доступно
только при включённом возврате. Участник по-прежнему пропускает вопросы и возвращается к ним, но кнопка
«Завершить раздел» или «Завершить тест» на обзоре неактивна, пока остаются вопросы без ответа; подсказка на
обзоре говорит, сколько осталось. Когда истекает время, раздел или тест завершается как обычно.». Отдельной
фразой: если экран обзора скрыт во вкладке «Структура», он всё равно появится, пока есть вопросы без ответа.

- [ ] **Шаг 2: PRD-19**

В FR-09 добавить предложение: «При настройке PRD-73 „Требовать ответ на все вопросы перед завершением“ окно не
появляется: кнопка завершения неактивна, пока есть неотвеченные.» В «Связанные документы» — ссылка на PRD-73.

- [ ] **Шаг 3: анализы конкурентов (ROADMAP §0.0.5)**

Перед правкой прочитать правило §0.0.5 и легенду каждой таблицы. Новая возможность — НОВАЯ строка «Запрет
завершения при неотвеченных вопросах» рядом со строкой пропуска и возврата; меняется только наша сторона;
ячейки конкурентов заполняются по данным их издания, а при отсутствии данных — тем обозначением, которое для
этого принято в легенде таблицы. Статус трека брать из журнала слияний `main`.

- [ ] **Шаг 4: ROADMAP и статус спецификации**

ROADMAP: трек PRD-73 со ссылкой на спецификацию и план, статус по факту. Спецификация: статус «Реализован» с
датой, отметки приёмки §10 — какие проверены в браузере, какие тестами.

- [ ] **Шаг 5: проверка разметки**

`npm run lint:md` или `npx --no-install markdownlint-cli2` по изменённым файлам — ноль замечаний.

- [ ] **Шаг 6: коммит (по разрешению владельца)**

Сообщение: `docs(prd-73): руководство автора, PRD-19, анализы и ROADMAP`.

### Задача 15: приёмка

- [ ] **Шаг 1: типы и целевые наборы**

`npx tsc --noEmit --incremental false`; все тестовые файлы, тронутые задачами 1-12, одним вызовом `npm test -- …`.
Полный прогон — только по отдельному «да» владельца.

- [ ] **Шаг 2: веб в браузере**

ВНИМАНИЕ: старт `npm run dev` из worktree переписывает `templates.source_path` встроенных шаблонов в общей
dev-БД на дерево worktree, и чужие сессии начинают рисовать его макеты. Перед стартом спросить владельца; после
приёмки вернуть, перезапустив dev из главной копии (или как скажет владелец).

Тест по темам с двумя разделами, настройка включена, лимит раздела 2 минуты. Проверить и снять скриншоты в
светлой и тёмной теме:

1. Конец раздела с двумя пропусками — кнопка неактивна, подсказка «Осталось без ответа: 2.» (эскиз `s-blocked`).
2. «К обзору» с середины раздела — ghost-кнопка неактивна, число учитывает невыданные (`s-midflow`).
3. Ответы на пропущенные — кнопка активна, окна подтверждения нет (`s-complete`).
4. Истечение лимита раздела с пропусками — раздел закрыт.
5. Скрытый в «Структуре» обзор: с пропусками показан, без пропусков — нет.
6. Сплошной тест: «Завершить тест» неактивна, подсказка «Чтобы завершить тест, …».
7. Маршрутизатор: тема с пропусками не закрывается кнопкой обзора.

Сверка с эскизом поэлементная: подписи, вариант кнопки, место подсказки.

- [ ] **Шаг 3: пакет в локальном плеере**

`npm run scorm:template` или выгрузка тестового теста, `npm run scorm:player` (плеер на 5050 может быть чужим —
сверить процесс). Сценарии 1-6 шага 2.

- [ ] **Шаг 4: регресс без настройки**

Тот же тест с выключенной настройкой: пропуск → обзор → окно подтверждения «N вопросов без ответа будут засчитаны
как неверные», завершение проходит.

- [ ] **Шаг 5: отчёт владельцу**

Что проверено в браузере, что тестами, какие отметки §10 спецификации закрыты, что не проверено и почему.
Слияние в `main` и пуш — только по разрешению владельца.

## Самопроверка плана по спецификации

| Требование | Задачи |
| --- | --- |
| FR-01 настройка, умолчание выкл | 4, 5, 7, 8 |
| FR-02 зависимость от возврата | 1, 7, 8 |
| FR-03 охват с невыданными, черновик не ответ | 1, 2 |
| FR-04 `disabled` и защита клика | 3, 9, 10, 11 |
| FR-05 подсказка | 2, 12 |
| FR-06 принудительные завершения | 11 (запасной путь не тронут), 15 (истечение лимита) |
| FR-07 окна подтверждения нет | 10, 11 |
| FR-08 отвечено всё — как сегодня | 2, 10, 11 |
| FR-09 адаптивный режим | 5 |
| FR-10 каналы | 4, 5, 6, 7 |
| FR-11 без настройки без изменений | 5, 10, 11, 15 |
| FR-12 скрытый обзор | 1, 10, 11, 15 |
| §8.3 контракт и макет | 2, 12, 13 |
| Документация (ROADMAP §0.0.5) | 13, 14 |
