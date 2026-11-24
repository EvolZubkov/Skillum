/**
 * @module shared/template/__tests__/action-disable
 * @description PRD-73: the host renders the actions it will not execute as disabled,
 * whatever markup the template ships them in.
 */
import { describe, it, expect } from "vitest";
import { disableActions } from "../action-disable";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("disableActions", () => {
  it("отключает кнопку запрещённого действия", () => {
    const root = mount('<button type="button" data-action="finish-review">Завершить</button>');
    disableActions(root, ["finish-review"]);
    const btn = root.querySelector("button")!;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("отключает каждую кнопку макета с этим действием", () => {
    const root = mount(
      '<button data-action="finish-review">A</button><footer><button data-action="finish-review">B</button></footer>',
    );
    disableActions(root, ["finish-review"]);
    root.querySelectorAll("button").forEach((b) => expect(b.disabled).toBe(true));
  });

  it("помечает ссылку, у которой нет свойства disabled", () => {
    const root = mount('<a href="#" data-action="finish-review">Завершить</a>');
    disableActions(root, ["finish-review"]);
    expect(root.querySelector("a")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("не трогает другие действия", () => {
    const root = mount('<button data-action="goto:3">3</button><button data-action="review-back">Назад</button>');
    disableActions(root, ["finish-review"]);
    root.querySelectorAll("button").forEach((b) => {
      expect(b.disabled).toBe(false);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
    });
  });

  it("с пустым списком ничего не делает", () => {
    const root = mount('<button data-action="finish-review">Завершить</button>');
    disableActions(root, []);
    expect(root.querySelector("button")!.disabled).toBe(false);
  });

  it("работает в Shadow DOM", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = '<button data-action="finish-review">Завершить</button>';
    disableActions(shadow, ["finish-review"]);
    expect(shadow.querySelector("button")!.disabled).toBe(true);
  });
});
