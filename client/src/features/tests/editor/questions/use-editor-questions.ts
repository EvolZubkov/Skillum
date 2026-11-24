/**
 * @module features/tests/editor/questions/use-editor-questions
 * @description The test editor's one list of questions (role-model.md 6.5.1).
 *
 * Before this hook every tab of the drawer read the bank (`GET /api/questions`) on its own. The
 * bank shows only the reader's own topics, so for whoever edits someone else's test with topics
 * outside their scope the drawer showed empty topics, wrong counts and false «not enough
 * questions» errors. The hook adds the questions the saved test supplies itself
 * (`GET /api/tests/:id/questions`) and names the topics the reader may read but not change.
 *
 * The bank query keeps its key `["/api/questions"]`, so the hook shares the cache with every
 * other reader of the bank and with the existing component tests that seed that key.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchTestContextQuestions,
  mergeQuestionRows,
  testContextQuestionsKey,
  type ContextQuestionRow,
  type TestContextQuestionsResponse,
} from "./test-context-questions";

/** What the hook gives its caller. */
export interface EditorQuestions<T> {
  /** The bank merged with the test's own questions; empty until something loads. */
  data: T[];
  /** The first load is still under way. */
  isLoading: boolean;
  /**
   * Both sources have answered (the test list may have failed; then the bank stands alone).
   * Checks that count questions wait for it, otherwise they would judge an empty list.
   */
  loaded: boolean;
  /** Topics of the test the reader may read but not change. */
  readOnlyTopicIds: ReadonlySet<string>;
}

const NO_TOPICS: ReadonlySet<string> = new Set();

/**
 * Questions for the test editor.
 *
 * @param testId - the saved test, or undefined for a test being created (then only the bank).
 * @param options.enabled - set false to keep both queries idle (default true).
 * @returns the merged list, loading flags and the read-only topics.
 */
export function useEditorQuestions<T extends { id?: string } = ContextQuestionRow>(
  testId: string | undefined,
  options: { enabled?: boolean } = {},
): EditorQuestions<T> {
  const enabled = options.enabled ?? true;
  const withContext = enabled && Boolean(testId);
  const bank = useQuery<T[]>({ queryKey: ["/api/questions"], enabled });
  const context = useQuery<TestContextQuestionsResponse<T>>({
    queryKey: testContextQuestionsKey(testId ?? ""),
    queryFn: () => fetchTestContextQuestions<T>(testId as string),
    enabled: withContext,
  });
  const data = useMemo(
    () => mergeQuestionRows(bank.data, context.data?.questions),
    [bank.data, context.data],
  );
  const readOnlyTopicIds = useMemo(
    () => (context.data ? new Set(context.data.readOnlyTopicIds) : NO_TOPICS),
    [context.data],
  );
  const contextSettled = !withContext || context.data !== undefined || context.isError;
  return {
    data,
    isLoading: bank.isLoading || (withContext && context.isLoading),
    loaded: bank.data !== undefined && contextSettled,
    readOnlyTopicIds,
  };
}
