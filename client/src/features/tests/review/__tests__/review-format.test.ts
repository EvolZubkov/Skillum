/**
 * @module features/tests/review/__tests__/review-format.test
 * @description PRD-52: форматтеры дат рецензирования.
 */
import { describe, it, expect } from "vitest";
import { shortWhen, when } from "../review-format";

describe("shortWhen", () => {
  it("пишет день, месяц и время с ведущими нулями", () => {
    const iso = new Date(2026, 10, 3, 9, 5).toISOString();
    expect(shortWhen(iso)).toBe("03.11 09:05");
  });
  it("на мусор отвечает пустой строкой", () => {
    expect(shortWhen("не дата")).toBe("");
    expect(when("не дата")).toBe("");
  });
});
