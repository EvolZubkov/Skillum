/**
 * @module shared/access/__tests__/topic-rights.test
 * @description The per-topic rights carried by a bank list row (role-model.md 6.6): a row
 * gives what it carries, and a row without them gives nothing.
 */
import { describe, it, expect } from "vitest";
import { FULL_TOPIC_RIGHTS, NO_TOPIC_RIGHTS, rightsOfTopic } from "../topic-rights";

describe("rightsOfTopic", () => {
  it("returns the rights the row carries", () => {
    const rights = { manage: true, delete: false, grant: false };
    expect(rightsOfTopic({ id: "t1", rights })).toEqual(rights);
  });

  it("grants nothing to a row without rights", () => {
    expect(rightsOfTopic({ id: "t1" })).toEqual(NO_TOPIC_RIGHTS);
    expect(rightsOfTopic({ id: "t1", rights: null })).toEqual(NO_TOPIC_RIGHTS);
    expect(rightsOfTopic(null)).toEqual(NO_TOPIC_RIGHTS);
    expect(rightsOfTopic(undefined)).toEqual(NO_TOPIC_RIGHTS);
  });

  it("keeps the constants frozen", () => {
    expect(Object.isFrozen(NO_TOPIC_RIGHTS)).toBe(true);
    expect(FULL_TOPIC_RIGHTS).toEqual({ manage: true, delete: true, grant: true });
  });
});
