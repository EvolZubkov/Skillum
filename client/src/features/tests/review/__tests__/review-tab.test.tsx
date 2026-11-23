/**
 * @module features/tests/review/__tests__/review-tab.test
 * @description PRD-52: вкладка «Рецензирование» редактора - рейл «Согласование / Комментарии». Проверяется
 * поведение, которое от облика не видно: на каком пункте вкладка открывается и что происходит, пока раздела
 * «Согласование» ещё нет.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewTab } from "../review-tab";

describe("<ReviewTab />", () => {
  it("с разделом «Согласование» открывается на нём", () => {
    render(<ReviewTab openComments={3} approval={<div>панель согласования</div>} comments={<div>лента</div>} />);
    expect(screen.getByText("панель согласования")).toBeInTheDocument();
    expect(screen.queryByText("лента")).toBeNull();
  });

  it("пункт «Комментарии» показывает число открытых", () => {
    render(<ReviewTab openComments={3} approval={<div>панель согласования</div>} comments={<div>лента</div>} />);
    expect(screen.getByTestId("review-rail-comments").querySelector(".ou-drawer__rail-badge"))
      .toHaveTextContent("3");
  });

  it("клик по пункту переключает панель", () => {
    render(<ReviewTab openComments={0} approval={<div>панель согласования</div>} comments={<div>лента</div>} />);
    fireEvent.click(screen.getByTestId("review-rail-comments"));
    expect(screen.getByText("лента")).toBeInTheDocument();
    expect(screen.queryByText("панель согласования")).toBeNull();
  });

  it("initialKey открывает вкладку на комментариях: так работает ссылка ?review=<id>", () => {
    render(
      <ReviewTab
        openComments={1}
        initialKey="comments"
        approval={<div>панель согласования</div>}
        comments={<div>лента</div>}
      />,
    );
    expect(screen.getByText("лента")).toBeInTheDocument();
  });

  it("без раздела «Согласование» в рейле один пункт, и открыты комментарии", () => {
    render(<ReviewTab openComments={2} comments={<div>лента</div>} />);
    expect(screen.queryByTestId("review-rail-approval")).toBeNull();
    expect(screen.getByText("лента")).toBeInTheDocument();
  });
});
