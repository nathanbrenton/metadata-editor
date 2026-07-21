/*
 * Performer roles are presented in a primitive instrument-family order for
 * readable liner-note summaries. Authored TOML and edit-mode order remain
 * unchanged; unknown custom roles stay visible after recognized families.
 */
export function getPerformerRoleDisplayPriority(
  role: string,
): number {
  const normalizedRole = role
    .trim()
    .toLocaleLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  if (
    /\b(?:vocal(?:s|ist)?|voice|singer|singing|choir|chorus|harmony|rap(?:per|ping)?)\b/.test(
      normalizedRole,
    )
  ) {
    return 10;
  }

  if (
    !/\bbass guitar\b/.test(normalizedRole) &&
    /\b(?:guitar(?:s|ist)?|acoustic guitar|electric guitar|baritone guitar|classical guitar|rhythm guitar|lead guitar|slide guitar|steel guitar)\b/.test(
      normalizedRole,
    )
  ) {
    return 20;
  }

  if (
    /\b(?:keyboard(?:s|ist)?|piano|pianist|electric piano|organ|organist|synth(?:esizer)?|mellotron|clavinet|harpsichord|rhodes|wurlitzer)\b/.test(
      normalizedRole,
    )
  ) {
    return 30;
  }

  // Match double/upright bass here before the broader bass family below.
  if (
    /\b(?:violin|viola|cello|violoncello|double bass|upright bass|contrabass|fiddle|string(?:s| section| ensemble)?)\b/.test(
      normalizedRole,
    )
  ) {
    return 40;
  }

  // Match bass clarinet and similar names before the broader bass family.
  if (
    /\b(?:woodwind(?:s)?|flute|piccolo|clarinet|oboe|bassoon|sax(?:ophone)?|recorder|english horn)\b/.test(
      normalizedRole,
    )
  ) {
    return 50;
  }

  if (
    /\b(?:brass|trumpet|trombone|french horn|horn|tuba|euphonium|cornet|flugelhorn)\b/.test(
      normalizedRole,
    )
  ) {
    return 60;
  }

  // Sequencing must outrank bass/drum token matches such as bass sequencing.
  if (
    /\b(?:sequenc(?:e|ed|er|ing)|program(?:med|mer|ming))\b/.test(
      normalizedRole,
    )
  ) {
    return 90;
  }

  if (/\bbass(?: guitar|ist)?\b/.test(normalizedRole)) {
    return 70;
  }

  if (
    /\b(?:drum(?:s|mer|ming)?|percussion(?:ist)?|shaker|tambourine|cymbal(?:s)?|conga(?:s)?|bongo(?:s)?|timpani|handclap(?:s)?|stomp(?:s)?)\b/.test(
      normalizedRole,
    )
  ) {
    return 80;
  }

  if (
    /\b(?:dj|turntable(?:s)?|scratch(?:ing)?)\b/.test(
      normalizedRole,
    )
  ) {
    return 100;
  }

  return 1000;
}

export function sortPerformerRoleDisplayValues(
  roles: readonly string[],
): string[] {
  return roles
    .map((role, sourceIndex) => ({
      role,
      sourceIndex,
    }))
    .sort((left, right) => {
      const priorityDifference =
        getPerformerRoleDisplayPriority(left.role) -
        getPerformerRoleDisplayPriority(right.role);

      return priorityDifference !== 0
        ? priorityDifference
        : left.sourceIndex - right.sourceIndex;
    })
    .map(({ role }) => role);
}
