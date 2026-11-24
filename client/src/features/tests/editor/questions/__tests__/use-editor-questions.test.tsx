/**
 * @module features/tests/editor/questions/__tests__/use-editor-questions.test
 * @description The editor's one list of questions: the bank merged with the questions read in
 * the context of the saved test, the read-only topics, and the `loaded` flag the validation
 * waits for (role-model.md 6.5.1).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type * as React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEditorQuestions } from "../use-editor-questions";

const BANK = [{ id: "q-own", topicId: "t-own" }];
const CONTEXT = {
  questions: [{ id: "q-own", topicId: "t-own" }, { id: "q-law", topicId: "t-law" }],
  readOnlyTopicIds: ["t-law"],
};

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function bankClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["/api/questions"], BANK);
  return client;
}

afterEach(() => vi.unstubAllGlobals());

describe("useEditorQuestions", () => {
  it("is the bank alone for an unsaved test and asks nothing else", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useEditorQuestions(undefined), { wrapper: wrapperWith(bankClient()) });
    expect(result.current.data).toEqual(BANK);
    expect(result.current.readOnlyTopicIds.size).toBe(0);
    expect(result.current.loaded).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds the questions of the test's topics and names the read-only ones", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => CONTEXT }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useEditorQuestions("test-1"), { wrapper: wrapperWith(bankClient()) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.data.map((q) => q.id)).toEqual(["q-own", "q-law"]);
    expect([...result.current.readOnlyTopicIds]).toEqual(["t-law"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/tests/test-1/questions", { credentials: "include" });
  });

  it("falls back to the bank when the test list is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    const { result } = renderHook(() => useEditorQuestions("test-1"), { wrapper: wrapperWith(bankClient()) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.data).toEqual(BANK);
  });

  it("asks nothing while disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useEditorQuestions("test-1", { enabled: false }), { wrapper: wrapperWith(bankClient()) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
