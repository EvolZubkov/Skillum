/**
 * @module shared/template/question-map-dom
 *
 * DOM half of the question map: pages the dots row, drives the «Все вопросы» panel.
 *
 * The LAYOUT owns the markup and the look; this module owns only the behaviour and finds
 * its parts by `data-qnav-*` hooks inside the map root (`[data-qnav]`):
 *
 * - `[data-qnav-dots]` — the row of dots (`.ou-quiz__dot`, one per question);
 * - `[data-qnav-prev]`, `[data-qnav-next]` — page arrows;
 * - `[data-qnav-range]` — the «11–17 из 17» caption;
 * - `[data-qnav-current]` — «К текущему вопросу», shown when the current dot is off page;
 * - `[data-qnav-open]` — the button that opens the panel;
 * - `[data-qnav-panel]` — the panel, with `[data-qnav-close]` inside.
 *
 * Every control ships `hidden` in the layout, so a template (or a host) that never calls
 * {@link attachQuestionMap} keeps the old behaviour: all dots, no controls. The module
 * un-hides the controls only when the questions do not fit on one page.
 *
 * Dots inside the panel carry the same `data-action="goto:N"` as the row dots, so the
 * host's own click delegation navigates — this module never navigates by itself, it only
 * closes the panel after a pick.
 *
 * Browser-safe and framework-free; works inside a Shadow DOM (outside clicks are detected
 * through `composedPath()`).
 */

import {
  QNAV_PAGE_SIZE,
  clampPage,
  needsPaging,
  pageCount,
  pageOf,
  pageSizeFor,
  rangeLabel,
} from "./question-map";

/** Attribute on the map root: `"true"` while the map is paged. Styles select on it. */
export const QNAV_PAGED_ATTR = "data-paged";

/**
 * Attribute on the map root: `"true"` while the narrow page size is in effect. Styles select on it to reserve
 * the width of a narrow page of dots instead of a wide one, so the «Все вопросы» button stays on the dots row.
 */
export const QNAV_NARROW_ATTR = "data-qnav-narrow";

const NOOP = (): void => undefined;

/**
 * One-based question number printed on a dot.
 *
 * @param dot A `.ou-quiz__dot` element.
 * @returns The number, or `NaN` when the dot carries none.
 */
function dotNumber(dot: HTMLElement): number {
  const fromData = dot.getAttribute("data-number");
  const raw = fromData ?? dot.textContent ?? "";
  return Number.parseInt(raw.trim(), 10);
}

/**
 * Attach paging and the panel to one question map.
 *
 * @param root The map root (`[data-qnav]`).
 * @returns A function that removes every listener this call added. The hosts rebuild the
 *   whole screen on each question, so the old root simply disappears; the document-level
 *   listeners also drop themselves once their root is no longer connected.
 */
export function attachQuestionMap(root: HTMLElement): () => void {
  const dotsRow = root.querySelector<HTMLElement>("[data-qnav-dots]");
  if (!dotsRow) return NOOP;
  const rowDots = Array.from(dotsRow.querySelectorAll<HTMLElement>(".ou-quiz__dot"));
  if (rowDots.length === 0) return NOOP;

  const prev = root.querySelector<HTMLButtonElement>("[data-qnav-prev]");
  const next = root.querySelector<HTMLButtonElement>("[data-qnav-next]");
  const range = root.querySelector<HTMLElement>("[data-qnav-range]");
  const toCurrent = root.querySelector<HTMLElement>("[data-qnav-current]");
  const openBtn = root.querySelector<HTMLElement>("[data-qnav-open]");
  const panel = root.querySelector<HTMLElement>("[data-qnav-panel]");
  const closeBtn = root.querySelector<HTMLElement>("[data-qnav-close]");
  const scene = root.closest<HTMLElement>(".tb-scene") ?? root;

  const total = rowDots.length;
  const numbers = rowDots.map(dotNumber);
  const currentDot = rowDots.find((d) => d.classList.contains("is-current"));
  const currentNumber = currentDot ? dotNumber(currentDot) : NaN;

  let size = pageSizeFor(scene.getBoundingClientRect().width);
  let page = Number.isFinite(currentNumber) ? pageOf(currentNumber, size) : 0;
  let open = false;

  const render = (): void => {
    const paged = needsPaging(total, size);
    root.setAttribute(QNAV_PAGED_ATTR, paged ? "true" : "false");
    root.setAttribute(QNAV_NARROW_ATTR, size < QNAV_PAGE_SIZE ? "true" : "false");
    page = clampPage(page, total, size);

    rowDots.forEach((dot, i) => {
      dot.hidden = paged && pageOf(numbers[i], size) !== page;
    });

    for (const el of [prev, next, range, openBtn]) if (el) el.hidden = !paged;
    if (prev) {
      prev.disabled = page <= 0;
      prev.setAttribute("aria-label", `Предыдущие ${size} вопросов`);
    }
    if (next) {
      next.disabled = page >= pageCount(total, size) - 1;
      next.setAttribute("aria-label", `Следующие ${size} вопросов`);
    }
    if (range) range.textContent = rangeLabel(page, total, size);
    if (toCurrent) {
      toCurrent.hidden = !(paged && Number.isFinite(currentNumber) && pageOf(currentNumber, size) !== page);
    }

    if (!paged && open) open = false;
    if (panel) panel.hidden = !open;
    if (openBtn) openBtn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const setOpen = (value: boolean, restoreFocus: boolean): void => {
    if (!panel || !openBtn) return;
    open = value;
    render();
    if (value) {
      const target = panel.querySelector<HTMLElement>(".is-current") ?? closeBtn ?? panel;
      target.focus?.();
    } else if (restoreFocus) {
      openBtn.focus?.();
    }
  };

  const onClick = (event: Event): void => {
    const target = event.target as Element | null;
    if (!target?.closest) return;
    if (target.closest("[data-qnav-prev]")) {
      page -= 1;
      render();
    } else if (target.closest("[data-qnav-next]")) {
      page += 1;
      render();
    } else if (target.closest("[data-qnav-current]")) {
      page = Number.isFinite(currentNumber) ? pageOf(currentNumber, size) : 0;
      render();
    } else if (target.closest("[data-qnav-open]")) {
      setOpen(!open, false);
    } else if (target.closest("[data-qnav-close]")) {
      setOpen(false, true);
    } else if (panel && target.closest("[data-qnav-panel] .ou-quiz__dot")) {
      // The host navigates through its own delegation; the panel just gets out of the way.
      setOpen(false, false);
    }
  };

  const doc = root.ownerDocument;
  const onKeyDown = (event: Event): void => {
    if (!root.isConnected) {
      detach();
      return;
    }
    if (open && (event as KeyboardEvent).key === "Escape") setOpen(false, true);
  };
  const onPointerDown = (event: Event): void => {
    if (!root.isConnected) {
      detach();
      return;
    }
    if (!open) return;
    const path = event.composedPath?.() ?? [];
    if ((panel && path.includes(panel)) || (openBtn && path.includes(openBtn))) return;
    setOpen(false, false);
  };

  let observer: ResizeObserver | null = null;
  const onResize = (): void => {
    const nextSize = pageSizeFor(scene.getBoundingClientRect().width);
    if (nextSize === size) return;
    size = nextSize;
    page = Number.isFinite(currentNumber) ? pageOf(currentNumber, size) : 0;
    render();
  };
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(onResize);
    observer.observe(scene);
  }

  root.addEventListener("click", onClick);
  doc.addEventListener("keydown", onKeyDown);
  doc.addEventListener("pointerdown", onPointerDown);

  function detach(): void {
    root.removeEventListener("click", onClick);
    doc.removeEventListener("keydown", onKeyDown);
    doc.removeEventListener("pointerdown", onPointerDown);
    observer?.disconnect();
    observer = null;
  }

  render();
  return detach;
}

/**
 * Attach every question map found inside a rendered screen.
 *
 * @param screen A rendered screen (or any ancestor of it).
 * @returns A function that detaches all of them.
 */
export function attachQuestionMaps(screen: ParentNode): () => void {
  const detachers = Array.from(screen.querySelectorAll<HTMLElement>("[data-qnav]")).map(attachQuestionMap);
  return () => detachers.forEach((d) => d());
}
