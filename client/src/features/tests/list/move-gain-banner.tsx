/**
 * @module features/tests/list/move-gain-banner
 *
 * Warning of the «Переместить в папку» dialog (folder access inheritance,
 * wireframe `docs/wireframes/approved/test-folder-access.html`, s-move-gain):
 * the destination folder adds people to the test. The title carries the count,
 * the text names the people with their level — the first ten, then «и ещё N».
 */
import { Banner } from "@skillum/ui-kit";
import { pluralize } from "@/lib/i18n";

/** One person a move adds, as the server names them. */
export interface GainedPerson {
  userId: string;
  name: string | null;
  accessLevel: "edit" | "assign";
}

/** How many people the text names before «и ещё N». */
const SHOWN = 10;

const LEVEL: Record<GainedPerson["accessLevel"], string> = {
  edit: "редактирование",
  assign: "назначение",
};

/** Title of the warning: «В новой папке доступ к тесту получат ещё 3 человека». */
export function gainTitle(n: number): string {
  const verb = pluralize(n, "получит", "получат", "получат");
  return `В новой папке доступ к тесту ${verb} ещё ${n} ${pluralize(n, "человек", "человека", "человек")}`;
}

/**
 * The warning, or nothing when the move adds nobody.
 *
 * @param props.gained - People the destination adds, in the server's order.
 */
export function MoveGainBanner({ gained }: { gained: readonly GainedPerson[] }) {
  if (gained.length === 0) return null;
  const names = gained
    .slice(0, SHOWN)
    .map((p) => `${p.name ?? "—"} (${LEVEL[p.accessLevel]})`)
    .join(", ");
  const rest = gained.length > SHOWN ? `, и ещё ${gained.length - SHOWN}` : "";
  return (
    <Banner
      variant="subtle"
      tone="warning"
      title={gainTitle(gained.length)}
      description={names + rest}
      data-testid="move-gain-banner"
    />
  );
}
