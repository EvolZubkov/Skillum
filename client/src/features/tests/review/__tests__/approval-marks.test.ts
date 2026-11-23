/**
 * @module features/tests/review/__tests__/approval-marks.test
 * @description PRD-52: бейджи согласования на точках карты вопросов в iframe пакета. Точка знает только индекс
 * `goto:N`, а отметка хранится по идентификатору вопроса, поэтому соответствие берётся из порядка выдачи прогона.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { applyApprovalMarks, ensureApprovalLegend, ensureApprovalStyle } from "../approval-marks";

function mapDoc(): Document {
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
  beforeEach(() => { doc = mapDoc(); });

  it("ставит атрибут на точки в строке и в панели одним правилом", () => {
    applyApprovalMarks(doc, ["q1", "q2"], (id) => (id === "q1" ? "all" : null));
    const first = [...doc.querySelectorAll('.ou-quiz__dot[data-action="goto:0"]')];
    expect(first).toHaveLength(2);
    for (const dot of first) expect(dot.getAttribute("data-review-approved")).toBe("all");
    for (const dot of doc.querySelectorAll('.ou-quiz__dot[data-action="goto:1"]')) {
      expect(dot.hasAttribute("data-review-approved")).toBe(false);
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

  it("точку с чужим действием не трогает", () => {
    doc.body.insertAdjacentHTML("beforeend", '<button class="ou-quiz__dot" data-action="next">3</button>');
    applyApprovalMarks(doc, ["q1", "q2"], () => "all");
    expect(doc.querySelector('[data-action="next"]')!.hasAttribute("data-review-approved")).toBe(false);
  });

  it("порядок выдачи берётся из переданного списка: индекс - это позиция, а не номер вопроса", () => {
    applyApprovalMarks(doc, ["q7", "q3"], (id) => (id === "q3" ? "stale" : null));
    expect(doc.querySelector('[data-action="goto:1"]')!.getAttribute("data-review-approved")).toBe("stale");
    expect(doc.querySelector('[data-action="goto:0"]')!.hasAttribute("data-review-approved")).toBe(false);
  });
});

describe("ensureApprovalLegend", () => {
  it("у рецензента дописывает две строки один раз", () => {
    const doc = mapDoc();
    ensureApprovalLegend(doc, "reviewer");
    ensureApprovalLegend(doc, "reviewer");
    expect(doc.querySelectorAll("[data-review-legend]")).toHaveLength(2);
  });

  it("у автора три строки", () => {
    const doc = mapDoc();
    ensureApprovalLegend(doc, "author");
    expect(doc.querySelectorAll("[data-review-legend]")).toHaveLength(3);
  });

  it("строка легенды несёт тот же атрибут бейджа и подпись дословно", () => {
    const doc = mapDoc();
    ensureApprovalLegend(doc, "reviewer");
    const first = doc.querySelector("[data-review-legend]")!;
    expect(first.textContent).toBe("вы согласовали");
    expect(first.querySelector(".ou-quiz__legend-dot")!.getAttribute("data-review-approved")).toBe("all");
  });

  it("без панели легенды ничего не делает", () => {
    const doc = document.implementation.createHTMLDocument("t");
    expect(() => ensureApprovalLegend(doc, "author")).not.toThrow();
  });
});

describe("ensureApprovalStyle", () => {
  it("кладёт стиль в документ один раз", () => {
    const doc = mapDoc();
    ensureApprovalStyle(doc, ".x{}");
    ensureApprovalStyle(doc, ".x{}");
    expect(doc.head.querySelectorAll("style[data-review-approval]")).toHaveLength(1);
  });
});
