/**
 * @module features/tests/review/use-approval-tooltip
 * @description PRD-52 (issue #62): which question dot of the package map the author points at or focuses.
 *
 * The dots live inside the package iframe, so the tooltip itself is drawn by the HOST above the frame (the
 * frame has neither project styles nor avatars). This hook only watches the frame: delegated listeners on its
 * document - hover and focus show, leave, blur and Escape hide. The dot is a real button, so the keyboard
 * reaches it with Tab. Listeners are re-attached on every inspector snapshot, as the package may replace its
 * document (restart), and are not attached at all when `enabled` is false (a reviewer never gets a tooltip).
 */
import { useEffect, useState, type RefObject } from "react";

/** A dot of the question map: the same selector in the dots row and in the «Все вопросы» panel. */
const DOT = '.ou-quiz__dot[data-action^="goto:"]';

/** The dot under pointer/focus: its position in the delivery order and its rectangle in viewport coordinates. */
export interface ActiveDot {
  index: number;
  rect: { left: number; top: number; width: number; height: number };
}

export function useApprovalTooltip(
  frameRef: RefObject<HTMLIFrameElement | null>,
  enabled: boolean,
  /** Changes on every inspector snapshot. */
  tick: unknown,
): ActiveDot | null {
  const [active, setActive] = useState<ActiveDot | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!enabled || !frame || !doc) {
      setActive(null);
      return undefined;
    }

    // Not `instanceof Element`: the target belongs to the frame's realm, whose `Element` is not the host's.
    const dotOf = (target: EventTarget | null): HTMLElement | null =>
      target && typeof (target as Element).closest === "function" ? (target as Element).closest<HTMLElement>(DOT) : null;

    const show = (dot: HTMLElement) => {
      const index = Number.parseInt((dot.getAttribute("data-action") ?? "").slice("goto:".length), 10);
      if (!Number.isFinite(index)) return;
      // Frame offset: the dot's rectangle is in frame coordinates, the popover anchors in the host viewport.
      const offset = frame.getBoundingClientRect();
      const r = dot.getBoundingClientRect();
      setActive({ index, rect: { left: offset.left + r.left, top: offset.top + r.top, width: r.width, height: r.height } });
    };
    const hide = () => setActive(null);

    const onOver = (e: Event) => {
      const dot = dotOf(e.target);
      if (dot) show(dot);
    };
    const onOut = (e: MouseEvent) => {
      const dot = dotOf(e.target);
      // Moving between children of the same dot is not leaving it.
      if (dot && dot.contains(e.relatedTarget as Node | null)) return;
      if (dot) hide();
    };
    const onFocusOut = (e: Event) => {
      if (dotOf(e.target)) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    doc.addEventListener("mouseover", onOver);
    doc.addEventListener("mouseout", onOut);
    doc.addEventListener("focusin", onOver);
    doc.addEventListener("focusout", onFocusOut);
    doc.addEventListener("keydown", onKey);
    return () => {
      doc.removeEventListener("mouseover", onOver);
      doc.removeEventListener("mouseout", onOut);
      doc.removeEventListener("focusin", onOver);
      doc.removeEventListener("focusout", onFocusOut);
      doc.removeEventListener("keydown", onKey);
    };
  }, [frameRef, enabled, tick]);

  return active;
}
