/**
 * @module features/tests/review/__tests__/use-approval-tooltip.test
 * @description Hover/focus/Escape handling of the question-dot tooltip, and that a reviewer gets none (issue #62).
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useApprovalTooltip } from "../use-approval-tooltip";

/** A frame whose document holds one map dot `goto:3`. */
function frameWithDot() {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.body.innerHTML = '<button class="ou-quiz__dot" data-action="goto:3">4</button>';
  return { frameRef: { current: iframe }, doc, dot: doc.querySelector("button")! };
}

describe("useApprovalTooltip", () => {
  it("opens on hover and closes on leave", () => {
    const { frameRef, dot } = frameWithDot();
    const { result } = renderHook(() => useApprovalTooltip(frameRef, true, null));
    expect(result.current).toBeNull();
    act(() => { dot.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    expect(result.current?.index).toBe(3);
    act(() => { dot.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })); });
    expect(result.current).toBeNull();
  });

  it("opens on keyboard focus, closes on blur and on Escape", () => {
    const { frameRef, doc, dot } = frameWithDot();
    const { result } = renderHook(() => useApprovalTooltip(frameRef, true, null));
    act(() => { dot.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(result.current?.index).toBe(3);
    act(() => { dot.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(result.current).toBeNull();
    act(() => { dot.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(result.current).toBeNull();
  });

  it("does nothing when disabled (reviewer)", () => {
    const { frameRef, dot } = frameWithDot();
    const { result } = renderHook(() => useApprovalTooltip(frameRef, false, null));
    act(() => { dot.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    expect(result.current).toBeNull();
  });

  it("ignores elements that are not map dots", () => {
    const { frameRef, doc } = frameWithDot();
    doc.body.insertAdjacentHTML("beforeend", "<span id='x'>x</span>");
    const { result } = renderHook(() => useApprovalTooltip(frameRef, true, null));
    act(() => { doc.getElementById("x")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    expect(result.current).toBeNull();
  });
});
