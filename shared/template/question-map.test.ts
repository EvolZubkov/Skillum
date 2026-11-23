/**
 * @module shared/template/question-map.test
 *
 * Unit tests of the pure paging arithmetic of the question map.
 */

import { describe, expect, it } from "vitest";
import {
  QNAV_PAGE_SIZE,
  QNAV_PAGE_SIZE_NARROW,
  clampPage,
  needsPaging,
  pageCount,
  pageOf,
  pageSizeFor,
  rangeLabel,
} from "./question-map";

describe("pageSizeFor", () => {
  it("is 10 on a wide scene and 5 on a narrow one", () => {
    expect(pageSizeFor(1200)).toBe(QNAV_PAGE_SIZE);
    expect(pageSizeFor(521)).toBe(QNAV_PAGE_SIZE);
    expect(pageSizeFor(520)).toBe(QNAV_PAGE_SIZE_NARROW);
    expect(pageSizeFor(360)).toBe(QNAV_PAGE_SIZE_NARROW);
  });

  it("treats an unmeasured scene as wide", () => {
    expect(pageSizeFor(0)).toBe(QNAV_PAGE_SIZE);
    expect(pageSizeFor(-5)).toBe(QNAV_PAGE_SIZE);
    expect(pageSizeFor(Number.NaN)).toBe(QNAV_PAGE_SIZE);
  });
});

describe("needsPaging", () => {
  it("is off while the questions fit on one page", () => {
    expect(needsPaging(8, 10)).toBe(false);
    expect(needsPaging(10, 10)).toBe(false);
  });

  it("is on past one page", () => {
    expect(needsPaging(11, 10)).toBe(true);
    expect(needsPaging(8, 5)).toBe(true);
  });
});

describe("pageCount / pageOf / clampPage", () => {
  it("counts pages and keeps at least one", () => {
    expect(pageCount(17, 10)).toBe(2);
    expect(pageCount(20, 10)).toBe(2);
    expect(pageCount(0, 10)).toBe(1);
  });

  it("puts a question on a fixed page (borders 1–10, 11–20)", () => {
    expect(pageOf(1, 10)).toBe(0);
    expect(pageOf(10, 10)).toBe(0);
    expect(pageOf(11, 10)).toBe(1);
    expect(pageOf(17, 5)).toBe(3);
  });

  it("never returns a negative page for a bad number", () => {
    expect(pageOf(0, 10)).toBe(0);
    expect(pageOf(Number.NaN, 10)).toBe(0);
  });

  it("clamps a page into range", () => {
    expect(clampPage(-1, 17, 10)).toBe(0);
    expect(clampPage(5, 17, 10)).toBe(1);
    expect(clampPage(1, 17, 10)).toBe(1);
  });
});

describe("rangeLabel", () => {
  it("prints the borders with an en dash and the total", () => {
    expect(rangeLabel(0, 17, 10)).toBe("1–10 из 17");
    expect(rangeLabel(1, 17, 10)).toBe("11–17 из 17");
  });
});
