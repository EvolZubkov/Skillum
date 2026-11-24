/**
 * @module features/tests/access/access-people
 *
 * Shared vocabulary of the «Общий доступ» panels of a test and of a test folder
 * (the topic card reuses it too): the people the panel names, the working access
 * levels, how a person is shown (name or e-mail, avatar initials) and who may be
 * offered as an owner or a grantee — only people with an administrative role
 * (role-model 6.0).
 */

import type { ComboboxOption } from "@skillum/ui-kit";
import { mayHoldContentAccess, type Role } from "@shared/access";
import { formatRoles } from "@/lib/roles";

/** A working access level: review is granted on a test by invitation, not here. */
export type AccessLevel = "edit" | "assign";

/** A person as `GET …/access/users` sends them. */
export interface AccessUser {
  id: string;
  name: string | null;
  email: string | null;
  roles?: string[];
}

/** Access level options for both the add-row and the per-grant selects. */
export const LEVEL_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "edit", label: "Редактирование" },
  { value: "assign", label: "Назначение" },
];

/**
 * Label of a level, as the selects show it.
 *
 * @param level - The access level.
 * @returns «Редактирование» or «Назначение».
 */
export function levelLabel(level: AccessLevel): string {
  return LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? level;
}

/**
 * Display name: the name, else the e-mail, else a dash.
 *
 * @param u - The person, possibly unknown.
 */
export function displayName(u?: AccessUser): string {
  if (!u) return "—";
  return u.name?.trim() || u.email || "—";
}

/**
 * Avatar initials: the first letters of two name words, else of the e-mail.
 *
 * @param u - The person, possibly unknown.
 */
export function initials(u?: AccessUser): string {
  const name = u?.name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (u?.email?.[0] ?? "?").toUpperCase();
}

/**
 * Whether the person may be offered as an owner or a grantee: an administrative
 * role is required (role-model 6.0). The server enforces the same rule.
 *
 * @param u - The person as the panel received them.
 */
export function mayReceiveAccess(u: AccessUser & { isExternal?: boolean }): boolean {
  return mayHoldContentAccess((u.roles ?? []) as Role[], u.isExternal === true);
}

/**
 * A searchable picker option for a person: the name (or e-mail) as the label,
 * the roles below it, and the name plus e-mail as the search text.
 *
 * @param u - The person.
 */
export function personOption(u: AccessUser): ComboboxOption<string> {
  return {
    value: u.id,
    label: displayName(u),
    searchText: `${u.name ?? ""} ${u.email ?? ""}`,
    meta: formatRoles(u.roles as Role[] | undefined) || undefined,
  };
}

/**
 * Options of an owner picker: everyone who may own content, plus the current
 * owner even when they no longer qualify, so the field still names them.
 *
 * @param users - The people the panel received.
 * @param currentOwnerId - The saved owner, if any.
 */
export function ownerOptions(users: readonly AccessUser[], currentOwnerId: string | null): ComboboxOption<string>[] {
  return users.filter((u) => u.id === currentOwnerId || mayReceiveAccess(u)).map(personOption);
}
