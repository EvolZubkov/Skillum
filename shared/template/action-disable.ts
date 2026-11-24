/**
 * @module shared/template/action-disable
 *
 * PRD-73 — renders the screen actions the host will not execute right now as
 * disabled. The host owns WHETHER an action runs (the «Завершить …» of the обзор is a
 * structural step of the flow, PRD-19 FR-16), so it also owns showing that it will
 * not: the template only ships the markup, and an external template that never heard
 * of the restriction still gets an inert button instead of one that silently ignores
 * clicks.
 *
 * Framework-free: the web host calls it after every render of `TemplateScreen`, the
 * SCORM runtime after `renderScreenInto`, both through this one implementation
 * (exported to the package as `TBTemplate.disableActions`).
 */

/**
 * Mark every element whose `data-action` is in `actions` as disabled.
 *
 * Controls that support it (buttons, inputs) get `disabled = true`, which also takes
 * them out of the tab order and stops their clicks. Every matched element gets
 * `aria-disabled="true"`, so a link-styled action in a foreign template is at least
 * announced as unavailable; the host still refuses the action in its handler.
 *
 * @param root The rendered screen: an element, a `ShadowRoot` or a document.
 * @param actions The `data-action` values to disable; an empty list is a no-op.
 */
export function disableActions(root: ParentNode, actions: readonly string[]): void {
  if (!actions.length) return;
  const nodes = root.querySelectorAll<HTMLElement>("[data-action]");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (actions.indexOf(el.getAttribute("data-action") ?? "") === -1) continue;
    if ("disabled" in el) (el as HTMLButtonElement).disabled = true;
    el.setAttribute("aria-disabled", "true");
  }
}
