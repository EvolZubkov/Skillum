/**
 * @module shared/access/topic-rights
 * @description What the reader may do with one topic of the bank list (role-model.md 6.6).
 *
 * The server checks every topic action against a SPECIFIC topic; the role only opens the action
 * in principle. So the list `GET /api/topics` carries the per-topic answer, and the screens never
 * offer an action the server would refuse with 403. The fields are computed on the server by the
 * same predicates that guard the routes (`server/services/topic-access.ts`).
 */

/** Per-topic rights of the reader. */
export interface TopicRights {
  /** `canManageTopicContent`: the topic's questions, its properties and its folder. */
  manage: boolean;
  /** `canDeleteTopic`: deleting the topic. */
  delete: boolean;
  /** `canGrantTopicAccess`: visibility and grants. */
  grant: boolean;
}

/** No right at all — what a row without `rights` gives. */
export const NO_TOPIC_RIGHTS: Readonly<TopicRights> = Object.freeze({ manage: false, delete: false, grant: false });

/** Every right — what an administrator's rows carry; also the fixture of component tests. */
export const FULL_TOPIC_RIGHTS: Readonly<TopicRights> = Object.freeze({ manage: true, delete: true, grant: true });

/**
 * Rights carried by a topic row. An absent answer is not a permission: a row without `rights`
 * gives nothing.
 *
 * @param topic - a row of `GET /api/topics`, or nothing.
 * @returns the row's rights, or {@link NO_TOPIC_RIGHTS}.
 */
export function rightsOfTopic(
  topic: { id?: string; rights?: TopicRights | null } | null | undefined,
): Readonly<TopicRights> {
  return topic?.rights ?? NO_TOPIC_RIGHTS;
}
