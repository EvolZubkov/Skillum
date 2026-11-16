/**
 * @module features/tests/access/access-people
 *
 * Shared vocabulary of the «Общий доступ» panels of a test and of a test folder:
 * the people the panel names, the working access levels and how a person is
 * shown (name or e-mail, avatar initials).
 */

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
