/**
 * @module server/services/test-topic-context
 * @description Reading a topic IN THE CONTEXT OF A TEST (role-model.md 6.5.1).
 *
 * The bank (`GET /api/questions`) shows only the topics in the reader's own scope. A test,
 * though, may draw from a topic outside it: the topic was shared and then made private, a
 * grant was revoked, or the test was handed over to someone who never held the topic. Whoever
 * edits the test still has to see the pools it draws from, otherwise the drawer shows empty
 * topics and every count built on them is wrong.
 *
 * The right is narrow on purpose. It covers only the topics the test references (its sections
 * and the banks of its scenario items), gives nothing in the bank, and says nothing about
 * editing: whether the reader may change a topic's content is still decided by
 * {@link canManageTopicContent}, which is why the answer names the read-only topics.
 *
 * The route gate (`requireTestScope("edit")`) runs before this module; nothing here checks the
 * test right again.
 */

import type { Role } from "@shared/access";
import type { Question } from "@shared/schema";
import { storage } from "../storage";
import { canManageTopicContent } from "./topic-access";

/** A question row as the editor reads it: the bank row plus its topic name. */
export type TestContextQuestion = Question & { topicName: string };

/** Answer of `GET /api/tests/:id/questions`. */
export interface TestContextQuestions {
  /** Every question of every topic the test references, topic by topic, in the author's order. */
  questions: TestContextQuestion[];
  /** Referenced topics whose content the reader may not change. */
  readOnlyTopicIds: string[];
}

/**
 * Topics a test references: its sections and the banks of its scenario items. The same set
 * that `PUT /api/tests/:id` exempts from the visibility check, so reading and saving agree on
 * what «the test's topics» are.
 *
 * @param testId - the test.
 * @returns distinct topic ids, sections first, in their stored order.
 */
export async function testReferencedTopicIds(testId: string): Promise<Set<string>> {
  const [sections, scenarios] = await Promise.all([
    storage.getTestSections(testId),
    storage.getTestScenarios(testId),
  ]);
  return new Set([...sections, ...scenarios].map((s) => s.topicId));
}

/**
 * Questions of the test's topics, read in the context of that test.
 *
 * @param roles - the reader's effective roles.
 * @param userId - the reader's id.
 * @param testId - the test; the caller has already checked the edit scope on it.
 * @returns the questions with their topic names and the read-only topics.
 */
export async function testContextQuestions(
  roles: readonly Role[],
  userId: string,
  testId: string,
): Promise<TestContextQuestions> {
  const questions: TestContextQuestion[] = [];
  const readOnlyTopicIds: string[] = [];
  for (const topicId of await testReferencedTopicIds(testId)) {
    const topic = await storage.getTopic(topicId);
    // A dangling reference is the referential checks' business, not a reading error.
    if (!topic) continue;
    for (const question of await storage.getQuestionsByTopic(topicId)) {
      questions.push({ ...question, topicName: topic.name });
    }
    if (!(await canManageTopicContent(roles, userId, topic))) readOnlyTopicIds.push(topicId);
  }
  return { questions, readOnlyTopicIds };
}
