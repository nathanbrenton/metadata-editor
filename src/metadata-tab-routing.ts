/*
 * Artwork descriptions and notes belong exclusively to the Artwork tab.
 * The path fallback still keeps ordinary notes, comments, and descriptions
 * visible when an imported field has not yet been registered.
 */
export function metadataRowMatchesNotesTab(
  path: string,
  group: string,
): boolean {
  if (group === "Artwork") {
    return false;
  }

  return (
    group === "Text and Notes" ||
    /(^|\.)(notes?|comment|description)(\.|\[|$)/.test(
      path.toLocaleLowerCase(),
    )
  );
}
