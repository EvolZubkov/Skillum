/**
 * @module features/tests/review/__tests__/review-approval-tooltip.test
 * @description The author's tooltip over a question dot: rows do not wrap, a long reviewer name is cut with an
 * ellipsis and keeps the full name in `title` (issue 67). Hooks are mocked: the frame is not under test here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const hooks = vi.hoisted(() => ({
  active: { index: 1, rect: { left: 10, top: 10, width: 20, height: 20 } },
  approvals: { viewer: "author", approvals: [] as unknown[], circle: [] as unknown[] },
}));

vi.mock("../use-approval-tooltip", () => ({ useApprovalTooltip: () => hooks.active }));
vi.mock("../use-review-approvals", () => ({ useReviewApprovals: () => hooks.approvals }));
vi.mock("../delivery-order", () => ({ deliveredQuestionIds: () => ["q0", "q1", "q2"] }));

import { ReviewApprovalTooltip } from "../review-approval-tooltip";

const LONG = "Приёмка приглашения с очень длинным именем рецензента Иванов-Петров-Сидоров";

function renderTooltip() {
  const frameRef = { current: { contentWindow: {} } as unknown as HTMLIFrameElement };
  return render(<ReviewApprovalTooltip frameRef={frameRef} testId="t1" tick={null} />);
}

describe("<ReviewApprovalTooltip />", () => {
  afterEach(() => {
    cleanup();
    hooks.approvals = { viewer: "author", approvals: [], circle: [] };
  });

  it("keeps rows on one line and cuts a long name, keeping it whole in the title", () => {
    hooks.approvals = {
      viewer: "author",
      approvals: [],
      circle: [
        { userId: "r1", name: "Ирина Петрова", accepted: true },
        { userId: "r2", name: LONG, accepted: true },
      ],
    };
    renderTooltip();
    const rows = screen.getAllByTestId("approval-tooltip-row");
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.className).toContain("rvt__row");
    const long = screen.getByText(LONG);
    expect(long.className).toContain("rvt__name");
    expect(long.getAttribute("title")).toBe(LONG);
    expect(screen.getAllByText("не согласовал")).toHaveLength(2);
  });
});
