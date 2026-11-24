/**
 * @module features/tests/editor/questions/test-context-questions
 * @description Questions of a test's topics read IN THE CONTEXT of that test
 * (role-model.md 6.5.1), as the test editor needs them.
 *
 * The bank list (`GET /api/questions`) carries only the topics in the reader's own scope. A
 * test may draw from a topic outside it, and whoever edits the test still reads that pool
 * through `GET /api/tests/:id/questions`. The editor wants ONE list, so the two are merged:
 * the bank first, then the questions only the test could supply. A topic is either in the bank
 * whole or not at all, so the order inside each topic stays the author's order.
 *
 * The cache key starts with `/api/questions` on purpose: every place that invalidates the bank
 * after a question is saved, imported or deleted refreshes this list too, without knowing it
 * exists.
 */
import type { Question } from "@shared/schema";

/** A question row as both endpoints return it. */
export type ContextQuestionRow = Question & { topicName?: string };

/** Answer of `GET /api/tests/:id/questions`. */
export interface TestContextQuestionsResponse<T = ContextQuestionRow> {
  /** Every question of every topic the test references. */
  questions: T[];
  /** Topics of the test whose content the reader may not change. */
  readOnlyTopicIds: string[];
}

/** Where a question opened from the test editor goes. */
export type QuestionOpenTarget = "editor" | "preview";

/**
 * React Query key of the test-context list.
 *
 * @param testId - the saved test.
 * @returns a key under the bank key `["/api/questions"]`.
 */
export function testContextQuestionsKey(testId: string): readonly ["/api/questions", "test-context", string] {
  return ["/api/questions", "test-context", testId];
}

/**
 * Load the questions of a test's topics in the context of that test.
 *
 * @param testId - the saved test.
 * @returns the questions and the read-only topics.
 * @throws Error when the server refuses or fails.
 */
export async function fetchTestContextQuestions<T = ContextQuestionRow>(
  testId: string,
): Promise<TestContextQuestionsResponse<T>> {
  const response = await fetch(`/api/tests/${encodeURIComponent(testId)}/questions`, { credentials: "include" });
  if (!response.ok) throw new Error(`GET /api/tests/${testId}/questions → ${response.status}`);
  return response.json();
}

/**
 * The bank plus the questions only the test could supply, without duplicates.
 *
 * @param bank - rows of `GET /api/questions`, or undefined before they load.
 * @param context - rows of `GET /api/tests/:id/questions`, or undefined.
 * @returns a new array: the bank rows, then the context rows the bank does not carry.
 */
export function mergeQuestionRows<T extends { id?: string }>(
  bank: readonly T[] | undefined,
  context: readonly T[] | undefined,
): T[] {
  const base = bank ?? [];
  if (!context || context.length === 0) return [...base];
  const known = new Set(base.map((q) => q.id).filter((id): id is string => Boolean(id)));
  return [...base, ...context.filter((q) => !q.id || !known.has(q.id))];
}

/**
 * Which window a question opened from the test editor gets. A question of a topic the reader
 * may not manage opens as the learner sees it: the question editor would offer a save the
 * server refuses (role-model.md 6.5.1).
 *
 * @param question - the resolved question, or null while it is unknown.
 * @param readOnlyTopicIds - topics of the test the reader may not manage.
 * @returns `"preview"`, `"editor"`, or null when there is nothing to open yet.
 */
export function questionOpenTarget(
  question: { topicId?: string | null } | null | undefined,
  readOnlyTopicIds: ReadonlySet<string>,
): QuestionOpenTarget | null {
  if (!question) return null;
  return question.topicId && readOnlyTopicIds.has(question.topicId) ? "preview" : "editor";
}
