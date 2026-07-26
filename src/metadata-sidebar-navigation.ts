export type MetadataSidebarNavigationDirection =
  | "previous"
  | "next";

export type MetadataSidebarScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  itemTop: number;
  itemHeight: number;
  edgePadding?: number;
};

/**
 * Resolve the adjacent release/track row without wrapping past either end.
 */
export function getAdjacentMetadataSidebarId(
  navigationIds: readonly string[],
  activeId: string,
  direction: MetadataSidebarNavigationDirection,
): string | null {
  if (navigationIds.length === 0) {
    return null;
  }

  const activeIndex = navigationIds.indexOf(activeId);

  if (activeIndex === -1) {
    return direction === "next"
      ? navigationIds[0]
      : navigationIds[navigationIds.length - 1];
  }

  const offset = direction === "next" ? 1 : -1;
  const destinationIndex = Math.min(
    navigationIds.length - 1,
    Math.max(0, activeIndex + offset),
  );

  return navigationIds[destinationIndex];
}

/**
 * Keep one sidebar row visible without asking scrollIntoView to move page
 * ancestors. Rows already inside the padded viewport do not move at all.
 */
export function getMetadataSidebarScrollTop({
  scrollTop,
  clientHeight,
  scrollHeight,
  itemTop,
  itemHeight,
  edgePadding = 8,
}: MetadataSidebarScrollMetrics): number {
  const safePadding = Math.max(0, edgePadding);
  const visibleTop = scrollTop + safePadding;
  const visibleBottom =
    scrollTop + clientHeight - safePadding;
  const itemBottom = itemTop + itemHeight;
  let nextScrollTop = scrollTop;

  if (itemTop < visibleTop) {
    nextScrollTop = itemTop - safePadding;
  } else if (itemBottom > visibleBottom) {
    nextScrollTop =
      itemBottom - clientHeight + safePadding;
  }

  const maximumScrollTop = Math.max(
    0,
    scrollHeight - clientHeight,
  );

  return Math.min(
    maximumScrollTop,
    Math.max(0, nextScrollTop),
  );
}
