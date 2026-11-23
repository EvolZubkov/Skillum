/**
 * @module features/tests/review/__tests__/review-approval-block.test
 *
 * PRD-52, спека 2026-11-23-review-approval-flag-design: блок «Согласование» в окне рецензирования. Проверяется
 * поведение, которое видно человеку: рецензент ставит и снимает отметку одним чекбоксом, устаревшую отметку
 * видит тегом и подтверждает заново, автор чекбокса не получает, но видит всех согласовавших и счётчик.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewApprovalBlock } from "../review-approval-block";
import type { ReviewApproval, ReviewApprovalsResponse } from "../review-approval-api";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    fetchReviewApprovals: vi.fn(),
    putReviewApproval: vi.fn(),
    deleteReviewApproval: vi.fn(),
  },
}));

vi.mock("../review-approval-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...apiMock,
}));

/** Отметка рецензента на вопрос. */
function approval(over: Partial<ReviewApproval> = {}): ReviewApproval {
  return {
    id: "a1", testId: "t1", reviewerId: "r1", reviewerName: "Ирина Петрова", anchorKind: "question",
    anchorKey: "q1", questionId: "q1", topicId: "tp1", contentPageId: null, contextLabel: null,
    pinnedContentHash: "h", approvedAt: "2026-11-22T14:05:00.000Z", stale: false, orphaned: false,
    ...over,
  };
}

function answer(data: Partial<ReviewApprovalsResponse> = {}) {
  apiMock.fetchReviewApprovals.mockResolvedValue({ viewer: "reviewer", approvals: [], ...data });
}

function renderBlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReviewApprovalBlock testId="t1" screenAnchor={{ kind: "question", questionId: "q1" }} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  apiMock.putReviewApproval.mockResolvedValue(approval());
  apiMock.deleteReviewApproval.mockResolvedValue(undefined);
});

describe("<ReviewApprovalBlock /> - рецензент", () => {
  it("даёт чекбокс «Согласовано» у теста и у текущего вопроса", async () => {
    answer();
    renderBlock();
    expect(await screen.findAllByRole("checkbox", { name: "Согласовано" })).toHaveLength(2);
    expect(screen.getByText("Тест в целом")).toBeInTheDocument();
  });

  it("клик по чекбоксу вопроса ставит отметку на текущий вопрос", async () => {
    answer();
    renderBlock();
    const boxes = await screen.findAllByRole("checkbox", { name: "Согласовано" });
    fireEvent.click(boxes[1]);
    await waitFor(() =>
      expect(apiMock.putReviewApproval).toHaveBeenCalledWith("t1", { kind: "question", questionId: "q1" }),
    );
  });

  it("клик по чекбоксу теста ставит отметку на тест целиком", async () => {
    answer();
    renderBlock();
    const boxes = await screen.findAllByRole("checkbox", { name: "Согласовано" });
    fireEvent.click(boxes[0]);
    await waitFor(() =>
      expect(apiMock.putReviewApproval).toHaveBeenCalledWith("t1", { kind: "test" }),
    );
  });

  it("повторный клик по включённому чекбоксу снимает отметку", async () => {
    answer({ approvals: [approval()] });
    renderBlock();
    const boxes = await screen.findAllByRole("checkbox", { name: "Согласовано" });
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(boxes[1]);
    await waitFor(() => expect(apiMock.deleteReviewApproval).toHaveBeenCalledWith("t1", "a1"));
  });

  it("у поставленной отметки показывает дату и время", async () => {
    answer({ approvals: [approval()] });
    renderBlock();
    expect(await screen.findAllByText(/22 ноября/)).not.toHaveLength(0);
  });

  it("устаревшую отметку показывает тегом и даёт согласовать новую редакцию", async () => {
    answer({ approvals: [approval({ stale: true })] });
    renderBlock();
    expect(await screen.findByText("по прежней редакции")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Согласовать новую редакцию" }));
    await waitFor(() =>
      expect(apiMock.putReviewApproval).toHaveBeenCalledWith("t1", { kind: "question", questionId: "q1" }),
    );
  });

  it("не показывает счётчик «согласовали N из M»: чужих отметок рецензент не видит", async () => {
    answer({ approvals: [approval()] });
    renderBlock();
    await screen.findAllByRole("checkbox", { name: "Согласовано" });
    expect(screen.queryByText(/согласовали \d+ из \d+/)).toBeNull();
  });
});

describe("<ReviewApprovalBlock /> - автор", () => {
  const authorData = {
    viewer: "author" as const,
    approvals: [
      approval({ reviewerName: "Ирина Петрова" }),
      approval({ id: "a2", reviewerId: "r2", reviewerName: "Сергей Ковалёв", approvedAt: "2026-11-21T19:12:00.000Z" }),
    ],
    reviewers: [
      { userId: "r1", name: "Ирина Петрова" },
      { userId: "r2", name: "Сергей Ковалёв" },
      { userId: "r3", name: "Анна Воробьёва" },
    ],
  };

  it("не даёт чекбокса: автор согласование принимает, а не даёт", async () => {
    answer(authorData);
    renderBlock();
    await screen.findAllByText("Ирина Петрова");
    expect(screen.queryByRole("checkbox", { name: "Согласовано" })).toBeNull();
  });

  it("показывает согласовавших с датой и счётчик «согласовали N из M»", async () => {
    answer(authorData);
    renderBlock();
    expect(await screen.findByText("Сергей Ковалёв")).toBeInTheDocument();
    expect(screen.getByText("согласовали 2 из 3")).toBeInTheDocument();
  });

  it("отметка на тест целиком считается отдельно от вопроса", async () => {
    answer({
      ...authorData,
      approvals: [approval({ id: "t", anchorKind: "test", anchorKey: "", questionId: null })],
    });
    renderBlock();
    expect(await screen.findByText("согласовали 1 из 3")).toBeInTheDocument();
    expect(screen.getByText("согласовали 0 из 3")).toBeInTheDocument();
  });
});
