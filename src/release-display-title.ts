/**
 * Prefer the authored release title exactly as stored. The generated title is
 * only a fallback for releases whose metadata does not yet define one.
 */
export function resolveReleaseDisplayTitle(
  authoredTitle: unknown,
  generatedTitle: string,
): string {
  if (
    typeof authoredTitle === "string" &&
    authoredTitle.trim().length > 0
  ) {
    return authoredTitle;
  }

  return generatedTitle;
}
