/** Matches the `lg:scroll-mt-4` floor on an anchor target — 16px of air above it. */
const anchorGap = 16;

/**
 * Scroll an element to the top of the viewport, clearing the sticky top bar.
 *
 * Below `lg` <PageHeader> is a full-bleed bar pinned to `top-0`, and how tall it
 * is depends on what the page put in it: a title alone, a title plus actions, a
 * control row under both. A fixed `scroll-mt-*` guesses wrong for half the
 * screens — an admin's Events header is nearly twice a staff member's — so the
 * bar is measured at scroll time instead.
 *
 * Above `lg` the header is `lg:static` and overlays nothing, which is why the
 * test is `position: sticky` rather than the element's mere existence.
 */
export function scrollToBelowTopBar(target: Element) {
  const bar = document.querySelector<HTMLElement>("[data-top-bar]");
  const barHeight = bar && getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().height : 0;

  window.scrollTo({
    top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - barHeight - anchorGap),
    behavior: "smooth",
  });
}
