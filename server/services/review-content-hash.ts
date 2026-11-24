/**
 * @module server/services/review-content-hash
 *
 * PRD-52: the content hash behind review pins (comments and approvals). Pure - it imports no storage, so both
 * `review-anchor` (the reader of staleness) and the questions repository (the writer of
 * `questions.content_changed_at`, issue 61) share ONE rule of «what counts as the content of a question».
 */

import { createHash } from "node:crypto";

/**
 * Stable serialisation: keys are sorted so the order of fields in JSON does not change the hash. Otherwise
 * «изменено после комментария» would light up from a mere reordering.
 */
export function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + stable(v)).join(",") + "}";
}

/** SHA-256 over the stable serialisation of the parts. */
export function sha256(parts: unknown[]): string {
  return createHash("sha256").update(parts.map(stable).join(" ")).digest("hex");
}

/**
 * Hash of the fields a reviewer argues about: the wording, the options, the key and the feedback. Difficulty,
 * tags and the price inside a test are deliberately NOT included - editing them does not make a remark about the
 * wording stale.
 */
export function questionReviewHash(question: {
  prompt: string;
  dataJson: unknown;
  correctJson: unknown;
  feedback?: string | null;
}): string {
  return sha256([question.prompt, question.dataJson, question.correctJson, question.feedback ?? null]);
}
