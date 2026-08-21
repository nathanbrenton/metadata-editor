import {
  getRelatedReleaseDescriptors,
  releaseDescriptorCategoryDefinitions,
  releaseDescriptorOntology,
  searchReleaseDescriptors,
  type ReleaseDescriptor,
  type ReleaseDescriptorCategoryDefinition,
  type ReleaseDescriptorCategoryId,
  type ReleaseDescriptorLevel,
} from "./release-descriptor-ontology.js";

export type EditorialDescriptorBrowserLevel =
  | "all"
  | ReleaseDescriptorLevel;

export type EditorialDescriptorBrowserFilters = {
  ontologyCategories: readonly ReleaseDescriptorCategoryId[];
  ontologyCategory?: ReleaseDescriptorCategoryId;
  family?: string;
  subfamily?: string;
  level?: EditorialDescriptorBrowserLevel;
  query?: string;
};

function descriptorPassesLevel(
  descriptor: ReleaseDescriptor,
  level: EditorialDescriptorBrowserLevel,
): boolean {
  return (
    level === "all" ||
    descriptor.level === level
  );
}

function uniqueDescriptors(
  descriptors: readonly ReleaseDescriptor[],
): ReleaseDescriptor[] {
  const byId = new Map<string, ReleaseDescriptor>();

  for (const descriptor of descriptors) {
    byId.set(descriptor.id, descriptor);
  }

  return [...byId.values()];
}

export function getEditorialDescriptorBrowserCategoryDefinitions(
  ontologyCategories: readonly ReleaseDescriptorCategoryId[],
): ReleaseDescriptorCategoryDefinition[] {
  const byId = new Map(
    releaseDescriptorCategoryDefinitions.map(
      (definition) => [definition.id, definition],
    ),
  );

  return ontologyCategories
    .map((categoryId) => byId.get(categoryId))
    .filter(
      (
        definition,
      ): definition is ReleaseDescriptorCategoryDefinition =>
        Boolean(definition),
    );
}

export function getEditorialDescriptorBrowserCategoryCount(
  ontologyCategories: readonly ReleaseDescriptorCategoryId[],
  ontologyCategory: ReleaseDescriptorCategoryId,
  level: EditorialDescriptorBrowserLevel = "all",
): number {
  if (!ontologyCategories.includes(ontologyCategory)) {
    return 0;
  }

  return releaseDescriptorOntology.filter(
    (descriptor) =>
      descriptor.category === ontologyCategory &&
      descriptorPassesLevel(descriptor, level),
  ).length;
}

export function getEditorialDescriptorBrowserFamilies(
  filters: Pick<
    EditorialDescriptorBrowserFilters,
    | "ontologyCategories"
    | "ontologyCategory"
    | "level"
  >,
): Array<{ label: string; count: number }> {
  const activeCategory =
    filters.ontologyCategory ??
    filters.ontologyCategories[0];
  const level = filters.level ?? "all";

  if (
    !activeCategory ||
    !filters.ontologyCategories.includes(
      activeCategory,
    )
  ) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const descriptor of releaseDescriptorOntology) {
    if (
      descriptor.category !== activeCategory ||
      !descriptorPassesLevel(descriptor, level)
    ) {
      continue;
    }

    counts.set(
      descriptor.family,
      (counts.get(descriptor.family) ?? 0) + 1,
    );
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) =>
      left.label.localeCompare(right.label),
    );
}

export function getEditorialDescriptorBrowserSubfamilies(
  filters: Pick<
    EditorialDescriptorBrowserFilters,
    | "ontologyCategories"
    | "ontologyCategory"
    | "family"
    | "level"
  >,
): Array<{ label: string; count: number }> {
  const family = filters.family?.trim();

  if (!family) {
    return [];
  }

  const activeCategory =
    filters.ontologyCategory ??
    filters.ontologyCategories[0];
  const level = filters.level ?? "all";

  if (
    !activeCategory ||
    !filters.ontologyCategories.includes(
      activeCategory,
    )
  ) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const descriptor of releaseDescriptorOntology) {
    if (
      descriptor.category !== activeCategory ||
      descriptor.family !== family ||
      !descriptorPassesLevel(descriptor, level)
    ) {
      continue;
    }

    counts.set(
      descriptor.subfamily,
      (counts.get(descriptor.subfamily) ?? 0) + 1,
    );
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) =>
      left.label.localeCompare(right.label),
    );
}

export function getEditorialDescriptorBrowserResults(
  filters: EditorialDescriptorBrowserFilters,
): ReleaseDescriptor[] {
  const level = filters.level ?? "all";
  const query = filters.query?.trim() ?? "";

  if (query) {
    const results = filters.ontologyCategories.flatMap(
      (category) =>
        searchReleaseDescriptors(
          query,
          {
            category,
            ...(level === "all"
              ? {}
              : { level }),
            limit: 100,
          },
        ),
    );

    return uniqueDescriptors(results).slice(0, 150);
  }

  const activeCategory =
    filters.ontologyCategory ??
    filters.ontologyCategories[0];

  if (
    !activeCategory ||
    !filters.ontologyCategories.includes(
      activeCategory,
    )
  ) {
    return [];
  }

  return releaseDescriptorOntology
    .filter((descriptor) => {
      if (
        descriptor.category !== activeCategory ||
        !descriptorPassesLevel(descriptor, level)
      ) {
        return false;
      }

      if (
        filters.family &&
        descriptor.family !== filters.family
      ) {
        return false;
      }

      if (
        filters.subfamily &&
        descriptor.subfamily !==
          filters.subfamily
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (left.level !== right.level) {
        return left.level === "common" ? -1 : 1;
      }

      return left.label.localeCompare(
        right.label,
      );
    })
    .slice(0, 200);
}

export function getEditorialDescriptorBrowserRelated(
  descriptor: ReleaseDescriptor,
): ReleaseDescriptor[] {
  return getRelatedReleaseDescriptors(
    descriptor.id,
  ).slice(0, 12);
}


const descriptorDefinitionOverrides: Readonly<Record<string, string>> = {
  "genre:progressive rock":
    "Rock built around extended forms, thematic development, instrumental interplay, or compositional ideas that reach beyond conventional song structure.",
  "genre:progressive metal":
    "A metal-oriented progressive style combining heavy timbres with extended forms, technical ensemble writing, and frequent rhythmic or harmonic complexity.",
  "genre:psychedelic rock":
    "Rock shaped by altered timbres, repetition, studio experimentation, expansive form, or surreal and immersive atmosphere.",
  "genre:shoegaze":
    "Guitar music where dense effects, feedback, sustained texture, and partially obscured vocals create an immersive wall of sound.",
  "genre:dream pop":
    "Atmospheric pop or rock emphasizing soft-focus texture, spacious production, and melodic or vocal dreaminess.",
  "genre:post-rock":
    "Rock instrumentation used for texture, dynamics, repetition, and long-form development rather than conventional riff-and-chorus songwriting.",
  "genre:math rock":
    "Rock characterized by intricate rhythmic organization, irregular meter, interlocking parts, and precise ensemble playing.",
  "genre:trip-hop":
    "Downtempo electronic music combining breakbeats, sampling, atmospheric production, and influences from hip-hop, dub, soul, or jazz.",
  "genre:progressive house":
    "House music organized around gradual development, layered builds, evolving harmony, and long-form tension and release.",
  "genre:melodic techno":
    "Techno that gives melodic and harmonic development a prominent role alongside repetitive club rhythm and synthesized texture.",
  "genre:drum & bass":
    "Fast breakbeat-driven electronic music built around syncopated drums, prominent low frequencies, and rapid rhythmic motion.",
  "genre:jungle":
    "A breakbeat-heavy electronic style using fast chopped drum patterns, deep bass, and a raw or highly kinetic rhythmic feel.",
  "genre:2-step":
    "A UK garage rhythm that omits some expected four-on-the-floor kicks, creating a syncopated, skipping two-step pulse.",
  "genre:dubstep":
    "Bass-focused electronic music commonly built around half-time weight, syncopated percussion, spacious production, and sub-bass movement.",
  "genre:ambient":
    "Music centered on atmosphere, sustained texture, space, and gradual change rather than a strongly foregrounded beat or song form.",
  "production:sidechain compression":
    "Compression whose gain reduction is triggered by a separate control signal, often used to create rhythmic ducking or make space between competing sounds.",
  "production:parallel compression":
    "A dynamics technique that blends a heavily compressed signal with an uncompressed or lightly compressed version to add density while retaining transients.",
  "production:granular synthesis":
    "Sound design that divides audio into very small grains and recombines or transforms them to create new textures, pitches, or time behavior.",
  "production:mid-side processing":
    "Stereo processing that treats the center information separately from the side information to control width, focus, or tonal balance.",
  "production:tape saturation":
    "Harmonic coloration and gentle compression associated with driving magnetic tape, often perceived as warmer, denser, or slightly softened.",
  "production:resampling":
    "Recording processed or synthesized audio back into a new sample so it can be edited, rearranged, or processed again as source material.",
  "production:room bleed":
    "Sound from one instrument or source intentionally or incidentally captured by microphones aimed at another source, contributing live spatial cohesion.",
  "theory:diatonic harmony":
    "Harmony built primarily from pitches and chords belonging to the prevailing key or mode, with little or no chromatic alteration.",
  "theory:functional harmony":
    "Harmony organized by tonal function, especially relationships among tonic, predominant, and dominant areas that create directed tension and resolution.",
  "theory:modal mixture":
    "Borrowing chords or scale degrees from a parallel mode, such as using material from the parallel minor inside a major-key passage.",
  "theory:diminished seventh harmony":
    "Harmony using diminished-seventh sonorities, often to intensify chromatic tension, connect nearby chords, or support modulation.",
  "theory:secondary dominants":
    "Temporary dominant-function chords that tonicize a chord other than the home tonic, adding directed chromatic motion without necessarily changing key.",
  "theory:quartal harmony":
    "Harmony built substantially from stacked fourths rather than conventional stacks of thirds, often producing an open or ambiguous tonal character.",
  "theory:counterpoint":
    "The coordinated writing of two or more melodically independent lines whose interaction creates the musical texture and harmony.",
  "theory:motivic development":
    "Developing a short musical idea through repetition, variation, transposition, fragmentation, inversion, or other transformations.",
  "rhythm:odd meter":
    "Meter organized in an irregular number of beats, such as 5/4 or 7/8, rather than the most common duple or triple groupings.",
  "rhythm:polyrhythm":
    "The simultaneous use of contrasting rhythmic groupings or pulses, creating layered rhythmic tension across the same span of time.",
  "rhythm:polymeter":
    "The simultaneous use of different meters whose bar lines or phrase cycles do not align on every measure.",
  "rhythm:metric modulation":
    "A tempo-transition technique where a rhythmic value in one tempo is reinterpreted as the pulse or subdivision of a new tempo.",
  "mood:optimistic":
    "Conveys positive expectation, confidence, or the sense that events are moving toward a favorable outcome.",
  "mood:otherworldly":
    "Feels strange, dreamlike, uncanny, or removed from ordinary physical reality.",
  "mood:paranoid":
    "Conveys suspicion, hypervigilance, or the sense of an unseen threat pressing in on the listener.",
  "mood:peaceful":
    "Creates a calm, settled emotional state with little perceived conflict, urgency, or threat.",
  "mood:playful":
    "Feels light, curious, teasing, or game-like rather than solemn or severe.",
  "mood:powerful":
    "Communicates strength, scale, authority, or emotional force that feels larger than ordinary conversational intensity.",
  "mood:radiant":
    "Feels luminous, open, and emotionally bright, often suggesting warmth or positive outward energy.",
  "mood:reflective":
    "Feels inward-looking and contemplative, as though the music is considering memory, meaning, or personal experience.",
  "mood:reminiscent":
    "Evokes memory or the sensation of recalling an earlier time, place, relationship, or experience.",
  "mood:resigned":
    "Conveys acceptance of loss, limitation, or an unwanted outcome after resistance has largely subsided.",
  "mood:resolute":
    "Conveys firm determination and steadiness in the face of difficulty, pressure, or uncertainty.",
  "mood:nocturnal":
    "Feels suited to or evocative of nighttime through darkness, intimacy, solitude, urban atmosphere, or reduced visual and emotional brightness.",
  "mood:melancholy":
    "Expresses thoughtful or lingering sadness, often with beauty, nostalgia, or emotional restraint rather than outright despair.",
  "mood:euphoric":
    "Conveys an intense uplift, release, or rush of positive emotion beyond ordinary happiness.",
  "mood:haunting":
    "Lingers with an eerie, emotionally persistent quality that can feel beautiful, unsettling, or difficult to shake.",
  "attitude:rebellious":
    "Projects resistance to rules, expectations, authority, or conventional behavior as part of the music's expressive stance.",
  "attitude:defiant":
    "Communicates open refusal to yield, comply, or be intimidated by pressure or opposition.",
  "attitude:irreverent":
    "Treats convention, authority, or seriousness with deliberate disrespect, humor, or playful disregard.",
  "attitude:swaggering":
    "Projects conspicuous confidence and bravado, often with a sense of physical strut, command, or self-display.",
  "attitude:edgy":
    "Feels deliberately provocative, risky, tense, or close to a social or aesthetic boundary.",
  "attitude:reckless":
    "Projects impulsive risk-taking and disregard for restraint, caution, or consequences.",
  "attitude:rowdy":
    "Feels loud, unruly, communal, and physically animated, with more emphasis on abandon than refinement.",
  "attitude:mischievous":
    "Projects playful troublemaking, teasing, or rule-bending without necessarily feeling hostile.",
  "attitude:sardonic":
    "Uses dry, cutting, or darkly amused cynicism as part of its expressive posture.",
  "energy:live-wire":
    "Feels electrically alert and barely contained, as though the performance could surge or break loose at any moment.",
  "energy:slow-burning":
    "Builds intensity gradually, allowing tension, texture, or emotion to accumulate instead of peaking immediately.",
  "energy:propulsive":
    "Creates a persistent sense of forward motion through rhythm, repetition, articulation, or arrangement momentum.",
  "energy:explosive":
    "Releases energy suddenly and forcefully, often through abrupt dynamic, rhythmic, timbral, or ensemble impact.",
  "energy:restrained":
    "Keeps intensity deliberately controlled, leaving energy implied or contained rather than fully released.",
  "sonic-quality:hazy":
    "Has softened edges and partially obscured detail, often through reverb, distortion, layering, or diffuse high-frequency information.",
  "sonic-quality:raw":
    "Preserves audible roughness, immediacy, imperfection, or unpolished performance character rather than smoothing every edge.",
  "sonic-quality:dense":
    "Contains many simultaneous layers, frequencies, or musical events, producing a full and highly occupied sonic field.",
  "sonic-quality:spacious":
    "Leaves audible room around elements or creates a pronounced sense of depth, width, distance, or open acoustic space.",
  "sonic-quality:organic":
    "Feels rooted in acoustic, physical, human, or naturally varying sound rather than obviously synthetic or mechanically uniform texture.",
  "sonic-quality:synthetic":
    "Foregrounds electronically generated, processed, or deliberately artificial timbres rather than naturalistic acoustic character.",
  "performance:spontaneous":
    "Sounds immediate and unforced, as though decisions are being made in the moment rather than fully predetermined or polished.",
  "performance:live-band immediacy":
    "Preserves the energy and interaction of musicians performing together, emphasizing real-time ensemble feel over isolated perfection.",
  "performance:virtuosic interplay":
    "Features technically demanding parts whose musical effect depends on precise and responsive interaction among performers.",
};

function descriptorDefinitionKey(
  descriptor: ReleaseDescriptor,
): string {
  return `${descriptor.category}:${descriptor.label.toLocaleLowerCase()}`;
}

function lowerFirst(value: string): string {
  return (
    value.slice(0, 1).toLocaleLowerCase() +
    value.slice(1)
  );
}

export function getEditorialDescriptorBrowserDefinition(
  descriptor: ReleaseDescriptor,
): string {
  const override =
    descriptorDefinitionOverrides[
      descriptorDefinitionKey(descriptor)
    ];

  if (override) {
    return override;
  }

  /*
   * A style can appear in the ontology both as a Genre and as an Influence.
   * Reuse the curated Genre definition for the Influence instance so the
   * browser still explains what the style means, then add influence-specific
   * guidance. This avoids generic copy such as "a reference point drawn from
   * progressive rock" when a richer style definition already exists.
   */
  if (descriptor.category === "influence") {
    const styleDefinition =
      descriptorDefinitionOverrides[
        `genre:${descriptor.label.toLocaleLowerCase()}`
      ];

    if (styleDefinition) {
      return (
        `${styleDefinition} ` +
        "As an influence, select it when this style materially shapes " +
        "the release rather than appearing only incidentally."
      );
    }
  }

  const label = descriptor.label;
  const lowerLabel = lowerFirst(label);

  switch (descriptor.category) {
    case "genre":
      return `A musical style or classification identified as ${label}; use it when this genre meaningfully describes the release rather than merely appearing as a minor influence.`;
    case "influence":
      return `A reference point drawn from ${lowerLabel}; use it when that tradition, aesthetic, or technique noticeably shapes the writing, arrangement, performance, or production.`;
    case "direction":
      return `An artistic orientation described as ${lowerLabel}; use it when this phrase captures where the project is moving or how this release differs from earlier work.`;
    case "element":
      return `A recurring musical or sonic feature built around ${lowerLabel}; use it when the element is important enough to help characterize the arrangement.`;
    case "instrumentation":
      return `An instrument, voice, synthesis tool, or sound source identified as ${lowerLabel}; use it when it is audibly important to the arrangement.`;
    case "production":
      return `A recording, mixing, editing, effects, or sound-design approach involving ${lowerLabel}; use it when the technique materially shapes the finished sound.`;
    case "theory": {
      if (descriptor.family === "Tonality & scales") {
        return `A tonal or scalar framework based on ${lowerLabel}; use it when this pitch collection or tonal organization is musically significant.`;
      }
      if (descriptor.family === "Harmony") {
        return `A harmonic language or chordal device based on ${lowerLabel}; use it when this relationship among pitches or chords is a noticeable part of the writing.`;
      }
      if (descriptor.family === "Voice leading") {
        return `A voice-leading or contrapuntal concept involving ${lowerLabel}; use it when the motion and interaction of individual lines are structurally important.`;
      }
      if (descriptor.family === "Melody") {
        return `A melodic-writing or development technique involving ${lowerLabel}; use it when this device noticeably shapes the tune or recurring musical ideas.`;
      }
      return `A formal or compositional concept involving ${lowerLabel}; use it when this structural device meaningfully organizes the music.`;
    }
    case "rhythm":
      return `A rhythmic or metric characteristic described as ${lowerLabel}; use it when this pulse, groove, subdivision, or timing relationship is a recognizable part of the music.`;
    case "mood":
      return `A ${descriptor.family.toLocaleLowerCase()} mood that makes the music feel ${lowerLabel}; use it when this emotional impression is clearly perceived by the listener.`;
    case "attitude":
      return `An expressive posture that feels ${lowerLabel}; use it when the performance communicates this stance or social attitude, independently of the song's underlying emotion.`;
    case "energy":
      return `Describes the music's perceived motion or intensity as ${lowerLabel}; use it for how strongly the arrangement seems to move, build, hold back, or release.`;
    case "sonic-quality":
      return `Describes the audible texture, space, density, finish, or tonal character as ${lowerLabel}; use it for how the sound itself is perceived rather than what the song is about.`;
    case "theme":
      return `A lyrical, narrative, or conceptual subject centered on ${lowerLabel}; use it when this idea recurs or materially shapes the meaning of the release.`;
    case "songwriting":
      return `A songwriting or compositional approach involving ${lowerLabel}; use it when this technique noticeably shapes form, development, lyrics, or ensemble writing.`;
    case "identity":
      return `A high-level statement of musical identity centered on ${lowerLabel}; use it when the phrase captures something durable about what makes the project or release feel like itself.`;
    case "performance":
      return `A performance characteristic described as ${lowerLabel}; use it when this quality is audible in delivery, ensemble interaction, spontaneity, or precision.`;
    case "context":
      return `Release context described as ${lowerLabel}; use it to explain the record's place in the artist's development, process, chronology, or archival history.`;
    case "place":
      return `A geographic, scene, studio, or imagined setting described as ${lowerLabel}; use it only when that environment meaningfully shapes the release or its presentation.`;
  }

  return `An editorial descriptor for ${lowerLabel}; use it when this term materially helps characterize the music, context, or presentation.`;
}

export function getEditorialDescriptorBrowserPath(
  descriptor: ReleaseDescriptor,
): string {
  const category =
    releaseDescriptorCategoryDefinitions.find(
      (definition) =>
        definition.id === descriptor.category,
    );

  return [
    category?.label ?? descriptor.category,
    descriptor.family,
    descriptor.subfamily,
  ].join(" › ");
}
