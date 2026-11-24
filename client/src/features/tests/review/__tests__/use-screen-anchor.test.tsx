/**
 * @module features/tests/review/__tests__/use-screen-anchor.test
 * @description The screen anchor is a question only while the package shows a question screen (issue #65).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScreenAnchor } from "../use-screen-anchor";

function setup(phase: string) {
  const win = {} as Window;
  (window as unknown as { TBInspector: unknown }).TBInspector = {
    readPkg: vi.fn(() => ({ state: { phase } })),
    currentScreenQuestion: vi.fn(() => ({ id: "q1", topicId: "tp1" })),
  };
  const frameRef = { current: { contentWindow: win } as unknown as HTMLIFrameElement };
  return renderHook(() => useScreenAnchor(frameRef, null)).result.current;
}

describe("useScreenAnchor", () => {
  afterEach(() => {
    delete (window as unknown as { TBInspector?: unknown }).TBInspector;
  });
  it("anchors to the question on a question screen", () => {
    expect(setup("question")).toEqual({ kind: "question", questionId: "q1", topicId: "tp1" });
  });
  it.each(["start", "router", "content", "review", "viewResults"])("anchors to the test on the %s screen", (phase) => {
    expect(setup(phase)).toEqual({ kind: "test" });
  });
});
