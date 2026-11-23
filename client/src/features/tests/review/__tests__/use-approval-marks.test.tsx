/**
 * @module features/tests/review/__tests__/use-approval-marks.test
 * @description PRD-52: хук ставит бейджи в iframe пакета и ВОЗВРАЩАЕТ их после перерисовки экрана. Пакет строит
 * разметку заново на каждом вопросе и уносит с ней всё, что хост поставил снаружи, - ради этого хук и подписан
 * на изменения DOM кадра.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { useRef } from "react";
import { useApprovalMarks } from "../use-approval-marks";
import type { ApprovalBadge } from "@shared/review/approval-state";

const DOTS = `
  <div data-qnav><div data-qnav-dots>
    <button class="ou-quiz__dot" data-action="goto:0">1</button>
    <button class="ou-quiz__dot" data-action="goto:1">2</button>
  </div><div data-qnav-panel><div class="tb-qnav__legend"></div></div></div>`;

function Host({ viewer, badgeOf }: { viewer: "reviewer" | "author" | null; badgeOf: (id: string) => ApprovalBadge | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useApprovalMarks(ref, viewer, badgeOf, 0);
  return <iframe ref={ref} title="stage" data-testid="stage" />;
}

function frameDoc(container: HTMLElement): Document {
  const frame = container.querySelector("iframe")!;
  return frame.contentDocument!;
}

beforeEach(() => {
  (window as unknown as { TBInspector: unknown }).TBInspector = {
    readPkg: () => ({ state: { flatQuestions: [{ id: "q1" }, { id: "q2" }] } }),
  };
});
afterEach(() => {
  cleanup();
  delete (window as { TBInspector?: unknown }).TBInspector;
});

describe("useApprovalMarks", () => {
  it("ставит бейджи на точки кадра по порядку выдачи", async () => {
    const { container } = render(<Host viewer="reviewer" badgeOf={(id) => (id === "q1" ? "all" : null)} />);
    const doc = frameDoc(container);
    doc.body.innerHTML = DOTS;
    await waitFor(() =>
      expect(doc.querySelector('[data-action="goto:0"]')!.getAttribute("data-review-approved")).toBe("all"),
    );
    expect(doc.querySelector('[data-action="goto:1"]')!.hasAttribute("data-review-approved")).toBe(false);
  });

  it("возвращает бейджи после того, как пакет перестроил экран", async () => {
    const { container } = render(<Host viewer="reviewer" badgeOf={() => "all"} />);
    const doc = frameDoc(container);
    doc.body.innerHTML = DOTS;
    await waitFor(() => expect(doc.querySelector("[data-review-approved]")).not.toBeNull());
    // Пакет строит разметку заново и уносит с ней атрибуты.
    doc.body.innerHTML = DOTS;
    await waitFor(() => expect(doc.querySelector("[data-review-approved]")).not.toBeNull());
  });

  it("кладёт стиль бейджа и строки легенды в кадр", async () => {
    const { container } = render(<Host viewer="author" badgeOf={() => null} />);
    const doc = frameDoc(container);
    doc.body.innerHTML = DOTS;
    await waitFor(() => expect(doc.head.querySelector("style[data-review-approval]")).not.toBeNull());
    await waitFor(() => expect(doc.querySelectorAll("[data-review-legend]")).toHaveLength(3));
  });

  it("без зрителя ничего не трогает", async () => {
    const { container } = render(<Host viewer={null} badgeOf={() => "all"} />);
    const doc = frameDoc(container);
    doc.body.innerHTML = DOTS;
    await new Promise((r) => setTimeout(r, 30));
    expect(doc.querySelector("[data-review-approved]")).toBeNull();
    expect(doc.head.querySelector("style[data-review-approval]")).toBeNull();
  });

  it("без инспектора (пакет не стартовал) не падает", async () => {
    delete (window as { TBInspector?: unknown }).TBInspector;
    const { container } = render(<Host viewer="reviewer" badgeOf={() => "all"} />);
    const doc = frameDoc(container);
    expect(() => { doc.body.innerHTML = DOTS; }).not.toThrow();
    await new Promise((r) => setTimeout(r, 30));
    // Бейджей на точках нет: порядок выдачи неизвестен. (Строки легенды свой атрибут несут всегда.)
    expect(doc.querySelector(".ou-quiz__dot[data-review-approved]")).toBeNull();
  });
});
