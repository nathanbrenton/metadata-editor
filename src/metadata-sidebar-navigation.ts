export type MetadataSidebarNavigationDirection =
  | "previous"
  | "next";


export type MetadataSidebarWheelMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  deltaY: number;
};

export type MetadataSidebarWheelHandoffPlan = {
  sidebarDeltaY: number;
  pageDeltaY: number;
  intercept: boolean;
};

export type MetadataSidebarWheelDeltaInput = {
  deltaY: number;
  deltaMode: number;
  clientHeight: number;
};

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

/**
 * Convert browser wheel units to pixels before splitting one gesture between
 * the bounded sidebar and the page. Firefox may report line or page units.
 */
export function normalizeMetadataSidebarWheelDelta({
  deltaY,
  deltaMode,
  clientHeight,
}: MetadataSidebarWheelDeltaInput): number {
  if (!Number.isFinite(deltaY)) {
    return 0;
  }

  if (deltaMode === 1) {
    return deltaY * 16;
  }

  if (deltaMode === 2) {
    return deltaY * Math.max(1, clientHeight);
  }

  return deltaY;
}

/**
 * Let the sidebar consume normal wheel movement. Only intercept a gesture
 * when it reaches an edge, then pass the unused remainder to the page.
 */
export function planMetadataSidebarWheelHandoff({
  scrollTop,
  clientHeight,
  scrollHeight,
  deltaY,
}: MetadataSidebarWheelMetrics): MetadataSidebarWheelHandoffPlan {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return {
      sidebarDeltaY: 0,
      pageDeltaY: 0,
      intercept: false,
    };
  }

  const maximumScrollTop = Math.max(
    0,
    scrollHeight - clientHeight,
  );
  const currentScrollTop = Math.min(
    maximumScrollTop,
    Math.max(0, scrollTop),
  );

  if (deltaY < 0) {
    const availableSidebarMovement = currentScrollTop;

    if (-deltaY <= availableSidebarMovement) {
      return {
        sidebarDeltaY: 0,
        pageDeltaY: 0,
        intercept: false,
      };
    }

    const sidebarDeltaY = -availableSidebarMovement;

    return {
      sidebarDeltaY,
      pageDeltaY: deltaY - sidebarDeltaY,
      intercept: true,
    };
  }

  const availableSidebarMovement =
    maximumScrollTop - currentScrollTop;

  if (deltaY <= availableSidebarMovement) {
    return {
      sidebarDeltaY: 0,
      pageDeltaY: 0,
      intercept: false,
    };
  }

  return {
    sidebarDeltaY: availableSidebarMovement,
    pageDeltaY:
      deltaY - availableSidebarMovement,
    intercept: true,
  };
}
