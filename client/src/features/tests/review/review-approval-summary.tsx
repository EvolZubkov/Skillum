/**
 * @module features/tests/review/review-approval-summary
 * @description PRD-52: раздел «Согласование» вкладки «Рецензирование» в ящике редактора теста - то, что видит
 * автор. Эскиз: `docs/wireframes/approved/prd52-review-approval.html` (состояния `attn`, `sum`, `empty`).
 *
 * Рассчитан на большой тест: сначала сводка по разделам (аккордеон, заголовок одной строкой), подробности по
 * запросу. По умолчанию показано только то, что требует внимания; внутри раздела матрица «вопрос - рецензент»,
 * постранично. Форма не выходит за границы окна: колонки сжимаются, длинный текст вопроса режется многоточием.
 *
 * Данные считает `review-approval-model` (правило бейджа - `shared/review/approval-state`), компонент их только
 * рисует. Рецензенту раздела нет вовсе: он согласование даёт, а не разбирает.
 */
import { useMemo, useState } from "react";
import {
  Accordion, AccordionItem, Avatar, IconButton, ProgressBar, SearchField, SegmentedControl, Select, Stack, Tag,
  Text,
} from "@skillum/ui-kit";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pluralize } from "@/lib/i18n";
import {
  buildApprovalSections, filterSections, type ApprovalFilterMode, type SectionInput, type SectionSummary,
} from "./review-approval-model";
import type { ReviewApproval, ReviewerEntry } from "./review-approval-api";
import { initialsOf, shortWhen, when } from "./review-format";
import { useReviewApprovals } from "./use-review-approvals";

export interface ReviewApprovalSummaryProps {
  testId: string;
  /** Разделы теста и их вопросы - то, что знает ящик. */
  sections: SectionInput[];
}

/** Строк матрицы на странице. */
const PAGE_SIZE = 20;

const ALL_REVIEWERS = "__all__";

const MODES: { value: ApprovalFilterMode; label: string }[] = [
  { value: "attn", label: "Требуют внимания" },
  { value: "all", label: "Все" },
  { value: "none", label: "Не согласованы" },
  { value: "stale", label: "До правки" },
];

/** Подпись раздела: нулевые счётчики не пишутся. */
function sectionSubtitle(s: SectionSummary): string {
  const parts = [`согласовано всеми ${s.all} из ${s.total}`];
  if (s.stale) parts.push(`до правки ${s.stale}`);
  if (s.none) parts.push(`не согласовано ${s.none}`);
  return parts.join(" · ");
}

/** «Скрыт 1 раздел» / «Скрыто 2 раздела» / «Скрыто 5 разделов». */
function hiddenText(n: number): string {
  const verb = n % 10 === 1 && n % 100 !== 11 ? "Скрыт" : "Скрыто";
  return `${verb} ${n} ${pluralize(n, "раздел", "раздела", "разделов")}: все вопросы согласованы`;
}

/** Ячейка матрицы: дата отметки, «до правки» или прочерк. */
function MatrixCellView({ cell }: { cell: { approvedAt: string; stale: boolean } | null }) {
  if (!cell) return <span className="rvs__none" aria-label="Не согласовал">—</span>;
  return cell.stale
    ? <Tag size="s" tone="warning" variant="outline" className="rvs__nowrap" aria-label="До правки">{shortWhen(cell.approvedAt)}</Tag>
    : <Tag size="s" tone="success" className="rvs__nowrap">{shortWhen(cell.approvedAt)}</Tag>;
}

/** Матрица одного раздела: строка - вопрос, столбец - принявший рецензент. */
function SectionMatrix(
  { section, circle, page, onPage }: {
    section: SectionSummary; circle: ReviewerEntry[]; page: number; onPage: (next: number) => void;
  },
) {
  const pages = Math.max(1, Math.ceil(section.rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const from = current * PAGE_SIZE;
  const rows = section.rows.slice(from, from + PAGE_SIZE);
  return (
    <Stack gap={3}>
      <table className="tb-table rvs__matrix" aria-label={`Согласование по вопросам: ${section.title}`}>
        <colgroup>
          <col className="rvs__col-q" />
          {circle.map((r) => <col key={r.userId} />)}
        </colgroup>
        <thead>
          <tr>
            <th>Вопрос</th>
            {circle.map((r) => (
              <th key={r.userId} className="rvs__th-av">
                <Avatar size="xs" initials={initialsOf(r.name, false)} title={r.name ?? r.userId} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.questionId}>
              <td><span className="rvs__ellip" title={row.label}>{row.label}</span></td>
              {circle.map((r) => (
                <td key={r.userId}><MatrixCellView cell={row.cells[r.userId] ?? null} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rvs__legend-row">
        <span className="rvs__legend">
          <Tag size="s" tone="success" className="rvs__nowrap">21.11 18:44</Tag>согласовал
          <Tag size="s" tone="warning" variant="outline" className="rvs__nowrap">20.11 10:16</Tag>до правки
          <span className="rvs__none">—</span>не согласовал
        </span>
      </div>

      <div className="rvs__pager">
        <Text tone="muted" variant="body-s">
          {section.rows.length === 0 ? "0" : `${from + 1}–${from + rows.length}`} из {section.rows.length}
        </Text>
        <span className="rvs__pager-btns">
          <IconButton
            variant="ghost" size="s" aria-label="Предыдущая страница" icon={<ChevronLeft size={16} />}
            disabled={current <= 0} onClick={() => onPage(current - 1)}
          />
          <IconButton
            variant="ghost" size="s" aria-label="Следующая страница" icon={<ChevronRight size={16} />}
            disabled={current >= pages - 1} onClick={() => onPage(current + 1)}
          />
        </span>
      </div>
    </Stack>
  );
}

/** Строка таблицы рецензентов. */
function ReviewerRow(
  { reviewer, approvals, questionIds }: {
    reviewer: ReviewerEntry; approvals: ReviewApproval[]; questionIds: Set<string>;
  },
) {
  const mine = approvals.filter((a) => a.reviewerId === reviewer.userId);
  const test = mine.find((a) => a.anchorKind === "test");
  const questions = mine.filter((a) => a.anchorKind === "question" && questionIds.has(a.anchorKey));
  const active = questions.filter((a) => !a.stale).length;
  const stale = questions.length - active;

  return (
    <tr>
      <td>
        <span className="rvs__person">
          <Avatar size="xs" initials={initialsOf(reviewer.name, false)} />
          <strong className="rvp__who">{reviewer.name || reviewer.userId}</strong>
        </span>
      </td>
      {reviewer.accepted ? (
        <>
          <td>
            {!test ? "не согласован" : test.stale
              ? <Tag size="s" tone="warning" className="rvs__nowrap">{`до правки · ${when(test.approvedAt)}`}</Tag>
              : <Tag size="s" tone="success" className="rvs__nowrap">{when(test.approvedAt)}</Tag>}
          </td>
          <td>{`${active} из ${questionIds.size}${stale ? ` · до правки ${stale}` : ""}`}</td>
        </>
      ) : (
        <td colSpan={2}><Tag size="s" variant="outline">не принял приглашение</Tag></td>
      )}
    </tr>
  );
}

export function ReviewApprovalSummary({ testId, sections }: ReviewApprovalSummaryProps) {
  const { viewer, approvals, reviewers, circle } = useReviewApprovals(testId);
  const [mode, setMode] = useState<ApprovalFilterMode>("attn");
  const [query, setQuery] = useState("");
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  /** Раскрытые разделы; `null` - значение по умолчанию (в режиме «требуют внимания» раскрыт первый). */
  const [openIds, setOpenIds] = useState<string[] | null>(null);
  const [pages, setPages] = useState<Record<string, number>>({});

  const circleIds = useMemo(() => circle.map((r) => r.userId), [circle]);
  const built = useMemo(
    () => buildApprovalSections(sections, approvals, circleIds),
    [sections, approvals, circleIds],
  );
  const filtered = useMemo(
    () => filterSections(built, { mode, query, reviewerId }),
    [built, mode, query, reviewerId],
  );
  const questionIds = useMemo(
    () => new Set(sections.flatMap((s) => s.questions.map((q) => q.id))),
    [sections],
  );

  if (viewer !== "author") return null;

  const defaultOpen = mode === "attn" && filtered.sections[0] ? [filtered.sections[0].topicId] : [];
  const open = openIds ?? defaultOpen;

  const testApprovedBy = circle.filter((r) =>
    approvals.some((a) => a.reviewerId === r.userId && a.anchorKind === "test" && !a.stale)).length;

  const resetView = () => setOpenIds(null);

  return (
    <Stack gap={4} className="rvs" data-testid="review-approval-summary">
      <div className="tb-section-label">Рецензенты</div>
      <table className="tb-table rvs__reviewers">
        <thead>
          <tr><th>Рецензент</th><th>Тест в целом</th><th>Вопросы</th></tr>
        </thead>
        <tbody>
          {reviewers.map((r) => (
            <ReviewerRow key={r.userId} reviewer={r} approvals={approvals} questionIds={questionIds} />
          ))}
        </tbody>
      </table>
      <div className="rvp__sum">
        <Text tone="muted" variant="body-s">
          {`Тест целиком согласовали ${testApprovedBy} из ${circle.length} принявших приглашение`}
        </Text>
      </div>

      <div className="tb-section-label">Согласование по объектам</div>
      <div className="rvs__toolbar">
        <SegmentedControl<ApprovalFilterMode>
          size="s"
          variant="accent"
          aria-label="Что показывать"
          value={mode}
          items={MODES}
          onChange={(next) => { setMode(next); resetView(); }}
        />
        <SearchField
          scope="тексту вопроса"
          aria-label="Поиск по тексту вопроса"
          className="rvs__search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); resetView(); }}
        />
        <Select<string>
          size="s"
          aria-label="Рецензент"
          value={reviewerId ?? ALL_REVIEWERS}
          options={[
            { value: ALL_REVIEWERS, label: "Все рецензенты" },
            ...circle.map((r) => ({ value: r.userId, label: r.name ?? r.userId })),
          ]}
          onChange={(value) => { setReviewerId(value === ALL_REVIEWERS ? null : value); resetView(); }}
        />
      </div>

      {filtered.sections.length === 0 ? (
        <Text tone="muted" variant="body-s">
          {query.trim() ? `Ничего не найдено по запросу «${query.trim()}»` : "Нет вопросов по выбранному фильтру"}
        </Text>
      ) : (
        <Accordion
          variant="plain"
          type="multiple"
          className="rvs__acc"
          value={open}
          onChange={(value) => setOpenIds(Array.isArray(value) ? value : [value])}
        >
          {filtered.sections.map((section) => (
            <AccordionItem
              key={section.topicId}
              value={section.topicId}
              title={<span className="rvs__title">{section.title}</span>}
              subtitle={sectionSubtitle(section)}
              trailing={
                <span className="rvs__pbar">
                  <ProgressBar
                    size="xs"
                    hideHeader
                    value={section.total ? Math.round((section.all / section.total) * 100) : 0}
                    aria-label={`Согласовано всеми: ${section.all} из ${section.total}`}
                  />
                </span>
              }
            >
              {open.includes(section.topicId) ? (
                <SectionMatrix
                  section={section}
                  circle={circle}
                  page={pages[section.topicId] ?? 0}
                  onPage={(next) => setPages((p) => ({ ...p, [section.topicId]: next }))}
                />
              ) : null}
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {mode === "attn" && !query.trim() && filtered.hidden > 0 ? (
        <div className="rvp__sum">
          <Text tone="muted" variant="body-s">{hiddenText(filtered.hidden)}</Text>
        </div>
      ) : null}
    </Stack>
  );
}
