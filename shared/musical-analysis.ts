/*
 * Musical-analysis helpers are shared by browser defaults and save-time
 * synchronization so Key and Camelot Key remain consistent.
 */
const camelotByNormalizedKey = new Map<string, string>([
  ["g# minor", "1A"], ["ab minor", "1A"], ["b major", "1B"],
  ["d# minor", "2A"], ["eb minor", "2A"], ["f# major", "2B"], ["gb major", "2B"],
  ["a# minor", "3A"], ["bb minor", "3A"], ["db major", "3B"], ["c# major", "3B"],
  ["f minor", "4A"], ["ab major", "4B"], ["g# major", "4B"],
  ["c minor", "5A"], ["eb major", "5B"], ["d# major", "5B"],
  ["g minor", "6A"], ["bb major", "6B"], ["a# major", "6B"],
  ["d minor", "7A"], ["f major", "7B"],
  ["a minor", "8A"], ["c major", "8B"],
  ["e minor", "9A"], ["g major", "9B"],
  ["b minor", "10A"], ["d major", "10B"],
  ["f# minor", "11A"], ["gb minor", "11A"], ["a major", "11B"],
  ["c# minor", "12A"], ["db minor", "12A"], ["e major", "12B"],
]);

function normalizeMusicalKey(value: string): string {
  return value.trim().replaceAll("♯", "#").replaceAll("♭", "b").replace(/\s+/g, " ").toLowerCase();
}

export function camelotKeyForMusicalKey(value: string): string | null {
  return camelotByNormalizedKey.get(normalizeMusicalKey(value)) ?? null;
}

export function isValidTuningReference(value: number): boolean {
  return Number.isFinite(value) && value >= 100 && value <= 999;
}
