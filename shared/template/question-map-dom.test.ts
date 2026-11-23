/**
 * @module shared/template/question-map-dom.test
 *
 * Behaviour of the paged question map against the markup contract of the layouts
 * (`data-qnav-*` hooks): paging, the range caption, the panel, outside click, Escape.
 */

import { afterEach, describe, expect, it } from "vitest";
import { attachQuestionMap } from "./question-map-dom";

/** Build a map root like the layout does: every control starts `hidden`. */
function mountMap(total: number, current: number): HTMLElement {
  const dots = (withNumber: boolean): string =>
    Array.from({ length: total }, (_, i) => {
      const n = i + 1;
      return `<button type="button" class="ou-quiz__dot${n === current ? " is-current" : ""}" data-action="goto:${i}"${
        withNumber ? ` data-number="${n}"` : ""
      }>${n}</button>`;
    }).join("");
  document.body.innerHTML = `
    <div class="tb-scene">
      <div data-qnav class="tb-scene__map">
        <button type="button" data-qnav-prev hidden></button>
        <div class="ou-quiz__dots" data-qnav-dots>${dots(true)}</div>
        <button type="button" data-qnav-next hidden></button>
        <span data-qnav-range hidden></span>
        <button type="button" data-qnav-current hidden>К текущему</button>
        <button type="button" data-qnav-open hidden aria-expanded="false">Все</button>
        <div data-qnav-panel hidden>
          <button type="button" data-qnav-close>x</button>
          <div class="ou-quiz__dots">${dots(false)}</div>
        </div>
      </div>
    </div>`;
  return document.querySelector<HTMLElement>("[data-qnav]")!;
}

const q = <T extends HTMLElement>(root: HTMLElement, sel: string): T => root.querySelector<T>(sel)!;
const visibleRowDots = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-qnav-dots] .ou-quiz__dot"))
    .filter((d) => !d.hidden)
    .map((d) => d.textContent ?? "");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("attachQuestionMap", () => {
  it("leaves a short test alone: every dot, no controls", () => {
    const root = mountMap(8, 3);
    attachQuestionMap(root);
    expect(visibleRowDots(root)).toHaveLength(8);
    expect(q(root, "[data-qnav-prev]").hidden).toBe(true);
    expect(q(root, "[data-qnav-next]").hidden).toBe(true);
    expect(q(root, "[data-qnav-open]").hidden).toBe(true);
    expect(root.getAttribute("data-paged")).toBe("false");
  });

  it("opens on the page of the current question", () => {
    const root = mountMap(17, 17);
    attachQuestionMap(root);
    expect(visibleRowDots(root)).toEqual(["11", "12", "13", "14", "15", "16", "17"]);
    expect(q(root, "[data-qnav-range]").textContent).toBe("11–17 из 17");
    expect(q(root, "[data-qnav-range]").hidden).toBe(false);
    expect(q<HTMLButtonElement>(root, "[data-qnav-next]").disabled).toBe(true);
    expect(q<HTMLButtonElement>(root, "[data-qnav-prev]").disabled).toBe(false);
    expect(root.getAttribute("data-paged")).toBe("true");
  });

  it("pages with the arrows without moving the current question", () => {
    const root = mountMap(17, 17);
    attachQuestionMap(root);
    q(root, "[data-qnav-prev]").click();
    expect(visibleRowDots(root)).toHaveLength(10);
    expect(visibleRowDots(root)[0]).toBe("1");
    expect(q<HTMLButtonElement>(root, "[data-qnav-prev]").disabled).toBe(true);
    // the current question is on another page: the way back is offered
    expect(q(root, "[data-qnav-current]").hidden).toBe(false);
    q(root, "[data-qnav-current]").click();
    expect(visibleRowDots(root)[0]).toBe("11");
    expect(q(root, "[data-qnav-current]").hidden).toBe(true);
  });

  it("opens and closes the panel with aria-expanded and Escape", () => {
    const root = mountMap(17, 17);
    attachQuestionMap(root);
    const open = q(root, "[data-qnav-open]");
    open.click();
    expect(q(root, "[data-qnav-panel]").hidden).toBe(false);
    expect(open.getAttribute("aria-expanded")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(q(root, "[data-qnav-panel]").hidden).toBe(true);
    expect(open.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the panel on a click outside it, not inside", () => {
    const root = mountMap(17, 17);
    attachQuestionMap(root);
    q(root, "[data-qnav-open]").click();
    q(root, "[data-qnav-panel]").dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    expect(q(root, "[data-qnav-panel]").hidden).toBe(false);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    expect(q(root, "[data-qnav-panel]").hidden).toBe(true);
  });

  it("closes the panel after a dot is picked, without stopping the host's click", () => {
    const root = mountMap(17, 17);
    attachQuestionMap(root);
    q(root, "[data-qnav-open]").click();
    let reached = false;
    document.addEventListener("click", () => (reached = true), { once: true });
    q<HTMLElement>(root, "[data-qnav-panel] .ou-quiz__dot").click();
    expect(q(root, "[data-qnav-panel]").hidden).toBe(true);
    expect(reached).toBe(true);
  });

  it("removes its listeners on detach", () => {
    const root = mountMap(17, 17);
    const detach = attachQuestionMap(root);
    detach();
    q(root, "[data-qnav-prev]").click();
    expect(visibleRowDots(root)[0]).toBe("11");
  });

  it("is a no-op for a root without dots", () => {
    document.body.innerHTML = `<div data-qnav></div>`;
    expect(() => attachQuestionMap(document.querySelector<HTMLElement>("[data-qnav]")!)()).not.toThrow();
  });
});
