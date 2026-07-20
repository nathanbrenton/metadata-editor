const storageKeyPrefix =
  "metadata-editor:readiness-skips:";

function storageKey(releaseId: string): string {
  return `${storageKeyPrefix}${releaseId}`;
}

export function readReadinessSkips(
  storage: Pick<Storage, "getItem">,
  releaseId: string,
): string[] {
  try {
    const raw = storage.getItem(storageKey(releaseId));

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return [...new Set(
      parsed.filter(
        (value): value is string =>
          typeof value === "string" &&
          value.trim().length > 0,
      ),
    )];
  } catch {
    return [];
  }
}

export function writeReadinessSkips(
  storage: Pick<Storage, "setItem">,
  releaseId: string,
  relativePaths: readonly string[],
): void {
  try {
    storage.setItem(
      storageKey(releaseId),
      JSON.stringify([...new Set(relativePaths)].sort()),
    );
  } catch {
    // Readiness acknowledgements are optional and must not block editing.
  }
}

export function addReadinessSkip(
  current: readonly string[],
  relativePath: string,
): string[] {
  return [...new Set([...current, relativePath])].sort();
}

export function removeReadinessSkip(
  current: readonly string[],
  relativePath: string,
): string[] {
  return current.filter(
    (candidate) => candidate !== relativePath,
  );
}
