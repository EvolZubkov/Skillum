/**
 * @module features/tests/review/__tests__/review-approval-summary.test
 *
 * PRD-52, спека 2026-11-23-review-approval-flag-design: раздел «Согласование» вкладки «Рецензирование» редактора -
 * таблица рецензентов, фильтр, сводка по разделам и матрица. Проверяется поведение, а не разметка: что скрыто по
 * умолчанию, что показывает фильтр, как пишутся счётчики и что видит автор при пустом результате.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewApprovalSummary } from "../review-approval-summary";
import type { SectionInput } from "../review-approval-model";
import type { ReviewApproval, ReviewApprovalsResponse } from "../review-approval-api";

const { apiMock } = vi.hoisted(() => ({
  apiMock: { fetchReviewApprovals: vi.fn(), putReviewApproval: vi.fn(), deleteReviewApproval: vi.fn() },
}));

vi.mock("../review-approval-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...apiMock,
}));

const NAMES: Record<string, string> = {
  r1: "Ирина Петрова", r2: "Сергей Ковалёв", r3: "Анна Воробьёва", r4: "Олег Смирнов",
};

function ap(reviewerId: string, questionId: string, over: Partial<ReviewApproval> = {}): ReviewApproval {
  return {
    id: `${reviewerId}-${questionId}`, testId: "t1", reviewerId, reviewerName: NAMES[reviewerId],
    anchorKind: "question", anchorKey: questionId, questionId, topicId: "tp", contentPageId: null,
    contextLabel: null, pinnedContentHash: "h", approvedAt: "2026-11-21T15:41:00.000Z",
    stale: false, orphaned: false, ...over,
  };
}

const SECTIONS: SectionInput[] = [
  { topicId: "tp1", title: "Раздел «О компании»", questions: [
    { id: "q1", label: "Вопрос 1 «Миссия»" },
    { id: "q2", label: "Вопрос 2 «Кластер»" },
    { id: "q3", label: "Вопрос 3 «Структура»" },
  ] },
  { topicId: "tp2", title: "Раздел «Охрана труда»", questions: [{ id: "q4", label: "Вопрос 1 «Каски»" }] },
];

/** Три принявших рецензента и один, не открывавший окно. */
const AUTHOR_DATA: ReviewApprovalsResponse = {
  viewer: "author",
  approvals: [
    ap("r1", "q1"), ap("r2", "q1"), ap("r3", "q1"),
    ap("r1", "q2"),
    ap("r3", "q3", { stale: true }),
    ap("r1", "q4"), ap("r2", "q4"), ap("r3", "q4"),
    {
      ...ap("r1", ""), id: "r1-test", anchorKind: "test", anchorKey: "", questionId: null, topicId: null,
      approvedAt: "2026-11-21T15:40:00.000Z",
    },
  ],
  reviewers: [
    { userId: "r1", name: NAMES.r1, accepted: true },
    { userId: "r2", name: NAMES.r2, accepted: true },
    { userId: "r3", name: NAMES.r3, accepted: true },
    { userId: "r4", name: NAMES.r4, accepted: false },
  ],
};

function renderSummary(data: ReviewApprovalsResponse = AUTHOR_DATA) {
  apiMock.fetchReviewApprovals.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReviewApprovalSummary testId="t1" sections={SECTIONS} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("<ReviewApprovalSummary /> - таблица рецензентов", () => {
  it("показывает всех приглашённых, а не принявшего помечает", async () => {
    renderSummary();
    expect(await screen.findByText("Олег Смирнов")).toBeInTheDocument();
    expect(screen.getByText("не принял приглашение")).toBeInTheDocument();
  });

  it("считает, сколько вопросов согласовал рецензент, и сколько из них до правки", async () => {
    renderSummary();
    await screen.findByText("Олег Смирнов");
    expect(screen.getByText("3 из 4")).toBeInTheDocument(); // Петрова: q1, q2, q4
    expect(screen.getByText("2 из 4 · до правки 1")).toBeInTheDocument(); // Воробьёва: q1, q4 и q3 до правки
  });

  it("пишет итог по тесту целиком среди принявших приглашение", async () => {
    renderSummary();
    expect(await screen.findByText("Тест целиком согласовали 1 из 3 принявших приглашение")).toBeInTheDocument();
  });

  it("автору-владельцу без рецензентов ничего не рисует, а рецензенту раздела нет вовсе", async () => {
    const { container } = renderSummary({ viewer: "reviewer", approvals: [] });
    await vi.waitFor(() => expect(apiMock.fetchReviewApprovals).toHaveBeenCalled());
    expect(container.querySelector(".rvs")).toBeNull();
  });
});

describe("<ReviewApprovalSummary /> - фильтр и разделы", () => {
  it("по умолчанию «Требуют внимания»: раздел без замечаний скрыт, об этом сказано", async () => {
    renderSummary();
    expect(await screen.findByText("Раздел «О компании»")).toBeInTheDocument();
    expect(screen.queryByText("Раздел «Охрана труда»")).toBeNull();
    expect(screen.getByText("Скрыт 1 раздел: все вопросы согласованы")).toBeInTheDocument();
  });

  it("«Все» показывает и раздел без замечаний", async () => {
    renderSummary();
    fireEvent.click(await screen.findByRole("button", { name: "Все" }));
    expect(screen.getByText("Раздел «Охрана труда»")).toBeInTheDocument();
  });

  it("подпись раздела не пишет нулевые счётчики", async () => {
    renderSummary();
    fireEvent.click(await screen.findByRole("button", { name: "Все" }));
    expect(screen.getByText("согласовано всеми 1 из 1")).toBeInTheDocument();
    expect(screen.getByText("согласовано всеми 1 из 3 · до правки 1")).toBeInTheDocument();
  });

  it("поиск без совпадений показывает пустой результат", async () => {
    renderSummary();
    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "бюджет" } });
    expect(screen.getByText("Ничего не найдено по запросу «бюджет»")).toBeInTheDocument();
  });

  it("раскрытый раздел показывает матрицу с датой отметки, свёрнутый - нет", async () => {
    renderSummary();
    await screen.findByText("Раздел «О компании»");
    // Первый раздел с замечаниями раскрыт сразу: в нём вопрос с отметкой Петровой по q2.
    const matrix = screen.getByRole("table", { name: "Согласование по вопросам: Раздел «О компании»" });
    expect(within(matrix).getAllByText(/\d{2}\.\d{2} \d{2}:\d{2}/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Раздел «О компании»/ }));
    expect(screen.queryByRole("table", { name: /Согласование по вопросам/ })).toBeNull();
  });

  it("в матрице пустая ячейка - прочерк, а не пустота", async () => {
    renderSummary();
    await screen.findByText("Раздел «О компании»");
    const matrix = screen.getByRole("table", { name: "Согласование по вопросам: Раздел «О компании»" });
    expect(within(matrix).getAllByLabelText("Не согласовал").length).toBeGreaterThan(0);
  });

  it("не принявший приглашение в матрицу не входит", async () => {
    renderSummary();
    await screen.findByText("Раздел «О компании»");
    const matrix = screen.getByRole("table", { name: "Согласование по вопросам: Раздел «О компании»" });
    expect(within(matrix).queryByTitle("Олег Смирнов")).toBeNull();
    expect(within(matrix).getByTitle("Ирина Петрова")).toBeInTheDocument();
  });
});
