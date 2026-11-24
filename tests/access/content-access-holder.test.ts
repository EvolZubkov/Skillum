/**
 * @module tests/access/content-access-holder.test
 *
 * Role-model 6.0: who may own a test, a test folder or a topic and receive a
 * working grant on it. Only the administrative roles qualify; a plain learner
 * and an external participant never do.
 */
import { describe, it, expect } from "vitest";
import { mayHoldContentAccess, ROLES, type Role } from "@shared/access";

describe("mayHoldContentAccess", () => {
  it.each<Role>([ROLES.SUPERADMIN, ROLES.ADMINISTRATOR, ROLES.DEVELOPER, ROLES.AUTHOR, ROLES.MANAGER])(
    "admits %s",
    (role) => {
      expect(mayHoldContentAccess([role])).toBe(true);
    },
  );

  it("refuses a plain learner and an account without roles", () => {
    expect(mayHoldContentAccess([ROLES.LEARNER])).toBe(false);
    expect(mayHoldContentAccess([])).toBe(false);
  });

  it("admits a learner who also holds an administrative role", () => {
    expect(mayHoldContentAccess([ROLES.LEARNER, ROLES.MANAGER])).toBe(true);
  });

  it("refuses an external participant whatever roles they carry", () => {
    expect(mayHoldContentAccess([ROLES.AUTHOR], true)).toBe(false);
  });
});
