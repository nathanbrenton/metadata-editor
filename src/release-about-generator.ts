export type ReleaseAboutTemplate = {
  id: string;
  label: string;
  description: string;
  template: string;
};

export const releaseAboutTemplates: readonly ReleaseAboutTemplate[] = [
  {
    id: "default-release",
    label: "1. Default release",
    description: "Balanced general-purpose release copy.",
    template:
      "[Release] finds [Artist] combining [primary musical element] with [contrasting element]. Built around [instrument / production characteristic], the songs move between [mood A] and [mood B], giving the record a sound that feels [characteristic] without losing [contrasting characteristic]. It is [concise statement about what the release represents].",
  },
  {
    id: "very-short-single",
    label: "2. Very short single",
    description: "One-sentence copy for a single.",
    template:
      "[Release] pairs [primary sound] with [secondary sound], turning [subject / emotion] into a [three-adjective] [genre / type] track.",
  },
  {
    id: "richer-single",
    label: "3. Slightly richer single",
    description: "A compact single description with an arrangement arc.",
    template:
      "Built around [riff / beat / instrument], “[Release]” moves from [opening quality] toward [payoff]. [Vocal / instrument] carries a song about [theme], while [production feature] keeps the arrangement [quality].",
  },
  {
    id: "ep-snapshot",
    label: "4. EP snapshot",
    description: "Frames an EP as a focused creative period.",
    template:
      "[Release] captures [Artist] during a period of [change / exploration]. Across [number] tracks, [sound A], [sound B], and [sound C] frame songs concerned with [themes]. Compact by design, the release feels less like a miniature album than a focused study of [central idea].",
  },
  {
    id: "album-evolution",
    label: "5. Album as evolution",
    description: "Shows how the release extends an established sound.",
    template:
      "After [earlier artistic direction], [Artist] turns toward [new direction] on [Release]. [Old element] remains, but it now sits alongside [new influence / production / instrumentation]. The result expands the project's vocabulary without abandoning the qualities that defined it: [quality 1], [quality 2], and [quality 3].",
  },
  {
    id: "debut",
    label: "6. The debut",
    description: "Introduces the artist's vocabulary and core identity.",
    template:
      "[Artist]'s debut arrives with its vocabulary already intact: [sound detail 1], [sound detail 2], and [distinctive feature]. Rather than settling neatly into [genre], [Release] pulls from [influence A] and [influence B] to establish a sound centered on [core identity].",
  },
  {
    id: "sonic-world",
    label: "7. Sonic world",
    description: "Atmosphere-first copy for immersive releases.",
    template:
      "[Release] occupies a world of [visual adjective 1], [visual adjective 2] spaces. [Instrument / sound] drifts through [production detail], while [other element] gives the music its sense of [emotion]. The tension between [opposite A] and [opposite B] defines the record.",
  },
  {
    id: "contradiction",
    label: "8. Contradiction",
    description: "Builds the description around two opposing qualities.",
    template:
      "[Release] is simultaneously [quality A] and [apparently contradictory quality B]. [Element A] provides the [quality A], while [Element B] introduces the [quality B]. That tension runs through songs concerned with [theme], creating music that can feel [experience 1] one moment and [experience 2] the next.",
  },
  {
    id: "instrumental-release",
    label: "9. Instrumental release",
    description: "Focuses on arrangement, development, and texture.",
    template:
      "Without a vocal narrative to dictate its meaning, [Release] develops through [instrument 1], [instrument 2], and [texture]. Melodies emerge gradually from [rhythmic / harmonic characteristic], allowing repetition and small changes to carry the arrangement. The result sits somewhere between [reference category A] and [reference category B].",
  },
  {
    id: "musician-forward",
    label: "10. Musician-forward release",
    description: "Centers an instrument or performance approach.",
    template:
      "At the center of [Release] is [instrument / performance]. [Artist] uses it less as [conventional role] than as [interesting role], surrounding it with [instrumentation]. The performances favor [quality] over [opposite], giving the record a distinctly [characteristic] character.",
  },
  {
    id: "production-forward",
    label: "11. Production-forward release",
    description: "Centers recording, sound design, and production choices.",
    template:
      "[Release] is built from [production technique 1], [production technique 2], and [sound source]. Rather than hiding the mechanics of the recording, [Artist] makes them part of the music: [specific example]. The production gives otherwise [simple / direct / restrained quality] songs an unusual sense of [space / movement / weight].",
  },
  {
    id: "hip-hop-lyrical",
    label: "12. Hip-hop / lyrical release",
    description: "Centers voice, perspective, themes, and production.",
    template:
      "On [Release], [Artist] approaches [subject] from [perspective]. [Flow / vocal quality] moves across production shaped by [production qualities], while recurring ideas about [theme 1] and [theme 2] give the project its center. The result is less a collection of tracks than a portrait of [person / place / time / conflict].",
  },
  {
    id: "place-scene",
    label: "13. Place / scene",
    description: "Connects a release to geography or scene without reducing it to genre.",
    template:
      "Shaped by [place], [Release] reflects its surroundings without reducing them to genre. [local / style influence] appears alongside [unexpected influence], while [specific musical characteristic] gives the record its own identity.",
  },
  {
    id: "collaboration",
    label: "14. Collaboration",
    description: "Explains how two collaborators retain distinct identities.",
    template:
      "[Artist A] and [Artist B] meet at the intersection of [Artist A characteristic] and [Artist B characteristic]. Rather than splitting the difference, [Release] lets both approaches remain visible: [specific contribution A] against [specific contribution B].",
  },
  {
    id: "demo-archive",
    label: "15. Demo / archive",
    description: "Treats unfinished or archival material as documentary context.",
    template:
      "Recorded during [period / context], these demos capture [Artist] before the arrangements were fully settled. [raw characteristic], [alternate instrumentation], and [performance quality] reveal the songs closer to their starting point, preserving decisions and imperfections that disappeared from the finished recordings.",
  },
  {
    id: "minimal-high-brow",
    label: "16. Minimal / high-brow",
    description: "Restrained editorial copy for design-conscious or understated releases.",
    template:
      "[Release] reduces [genre / form] to a few carefully chosen elements: [element 1], [element 2], and [element 3]. The arrangements leave unusual amounts of space around the performances, allowing [specific musical behavior] to carry as much weight as melody. [Artist] favors suggestion over spectacle, producing music that rewards close listening without demanding it.",
  },
];

const genreInfluenceSuggestions = [
  "alternative rock",
  "progressive rock",
  "indie rock",
  "post-rock",
  "post-punk",
  "punk",
  "shoegaze",
  "industrial rock",
  "electronic",
  "electronica",
  "ambient music",
  "synth-pop",
  "trip-hop",
  "IDM",
  "house",
  "techno",
  "hip-hop",
  "experimental pop",
  "R&B",
  "soul",
  "jazz",
  "classical chamber music",
  "minimalism",
  "film scoring",
  "folk",
  "singer-songwriter music",
] as const;

const artisticDirectionSuggestions = [
  "guitar-driven alternative rock",
  "progressive rock arrangements",
  "raw live-band performances",
  "melodic rock songwriting",
  "acoustic songwriting",
  "minimal electronic arrangements",
  "ambient experimentation",
  "beat-driven electronic production",
  "sample-based production",
  "lo-fi home recording",
  "dense layered arrangements",
  "stripped-back arrangements",
  "instrumental composition",
  "narrative songwriting",
  "more conventional song structures",
  "heavier guitar music",
  "atmospheric rock",
] as const;

const newDirectionSuggestions = [
  ...artisticDirectionSuggestions,
  "a more electronic sound",
  "greater harmonic complexity",
  "more spacious arrangements",
  "a more intimate sound",
  "more direct songwriting",
  "more experimental structures",
  "a darker atmosphere",
  "a brighter melodic palette",
  "greater rhythmic emphasis",
  "more organic instrumentation",
  "a more cinematic sound",
] as const;

const musicalElementSuggestions = [
  "distorted guitars",
  "clean guitars",
  "acoustic guitar",
  "acoustic piano",
  "bowed cello",
  "electric bass",
  "live drums",
  "electronic percussion",
  "drum machines",
  "synthesized textures",
  "analog synthesizers",
  "sampled percussion",
  "sub-bass",
  "layered vocal harmonies",
  "close-miked vocals",
  "ambient field recordings",
  "repetitive melodic figures",
  "sustained drones",
  "interlocking guitar lines",
  "sparse piano figures",
] as const;

const instrumentSuggestions = [
  "electric guitar",
  "acoustic guitar",
  "acoustic piano",
  "electric piano",
  "bowed cello",
  "electric bass",
  "live drums",
  "drum machine",
  "analog synthesizer",
  "digital synthesizer",
  "sampled percussion",
  "voice",
  "layered vocals",
  "sub-bass",
  "field recordings",
] as const;

const productionSuggestions = [
  "programmed drums",
  "layered overdubs",
  "dry close-miking",
  "sample manipulation",
  "saturated distortion",
  "wide stereo ambience",
  "minimal processing",
  "granular texture",
  "reverb-heavy space",
  "filtered synthesizers",
  "tape-like saturation",
  "hard-panned guitars",
  "compressed drum transients",
  "room-mic ambience",
  "lo-fi saturation",
  "clean digital production",
  "repetition with subtle variation",
] as const;

const qualitySuggestions = [
  "melodic",
  "intimate",
  "nocturnal",
  "melancholy",
  "anxious",
  "restrained",
  "volatile",
  "hopeful",
  "uneasy",
  "cinematic",
  "meditative",
  "abrasive",
  "warm",
  "cold",
  "playful",
  "brooding",
  "vulnerable",
  "euphoric",
  "isolated",
  "expansive",
  "raw",
  "precise",
  "spacious",
  "dense",
  "angular",
  "urgent",
  "dreamlike",
  "organic",
  "mechanical",
  "emotionally direct",
] as const;

const moodSuggestions = [
  "possessiveness",
  "longing",
  "despair",
  "hope",
  "anxiety",
  "isolation",
  "nostalgia",
  "intimacy",
  "uncertainty",
  "euphoria",
  "grief",
  "desire",
  "alienation",
  "resilience",
  "restlessness",
  "calm",
] as const;

const themeSuggestions = [
  "longing",
  "isolation",
  "memory",
  "desire",
  "identity",
  "grief",
  "anxiety",
  "hope",
  "ambition",
  "conflict",
  "nostalgia",
  "intimacy",
  "alienation",
  "uncertainty",
  "self-doubt",
  "resilience",
  "possessiveness",
  "despair",
  "obsession",
  "change",
  "connection",
  "loss",
] as const;

const identitySuggestions = [
  "emotionally direct songwriting",
  "melodic songwriting",
  "lyrical introspection",
  "narrative songwriting",
  "rhythmic tension",
  "atmospheric restraint",
  "harmonic ambiguity",
  "melodic aggression",
  "live-band immediacy",
  "cinematic atmosphere",
  "gradual development",
  "texture over virtuosity",
  "melody over complexity",
  "the tension between acoustic and electronic sound",
  "the contrast between vulnerability and aggression",
  "the contrast between polished production and raw performance",
] as const;

const releaseMeaningSuggestions = [
  "an early exploration of recording and songwriting",
  "a transition toward a more defined artistic voice",
  "a document of the project's formative period",
  "a focused refinement of the artist's existing language",
  "a deliberate expansion of the project's sonic palette",
  "a snapshot of a period of experimentation",
  "a more confident statement of the project's identity",
  "a bridge between earlier material and a new direction",
] as const;

const threeAdjectiveSuggestions = [
  "tense, melodic, nocturnal",
  "restrained, intimate, uneasy",
  "bright, rhythmic, euphoric",
  "dark, spacious, cinematic",
  "raw, direct, volatile",
  "warm, reflective, melodic",
  "dense, anxious, propulsive",
  "minimal, cold, hypnotic",
  "dreamlike, fragile, expansive",
  "abrasive, urgent, cathartic",
] as const;

const openingQualitySuggestions = [
  "a sparse opening",
  "restrained tension",
  "a minimal pulse",
  "a hushed atmosphere",
  "a dry rhythmic figure",
  "a single repeated motif",
  "an intimate verse",
  "uneasy stillness",
] as const;

const payoffSuggestions = [
  "a dense climax",
  "an expansive chorus",
  "full-band impact",
  "a melodic release",
  "rhythmic intensity",
  "layered distortion",
  "a wide-open refrain",
  "a sudden drop in texture",
] as const;

const changeSuggestions = [
  "transition",
  "experimentation",
  "stylistic expansion",
  "creative uncertainty",
  "technical experimentation",
  "songwriting development",
  "production exploration",
  "reassessment",
  "refinement",
  "collaboration",
] as const;

const distinctiveFeatureSuggestions = [
  "nocturnal atmosphere",
  "interlocking guitar lines",
  "a hybrid acoustic and electronic palette",
  "unusual harmonic movement",
  "restrained dynamics",
  "dense layered production",
  "spacious negative space",
  "contrast between organic and synthetic textures",
  "melodic bass movement",
  "fragmented vocal treatment",
] as const;

const visualAdjectiveSuggestions = [
  "dimly lit",
  "nocturnal",
  "rain-soaked",
  "shadowed",
  "hazy",
  "fluorescent",
  "industrial",
  "coastal",
  "urban",
  "spacious",
  "cinematic",
  "smoky",
  "cold",
  "warm",
  "dreamlike",
  "claustrophobic",
] as const;

const textureSuggestions = [
  "grainy distortion",
  "warm analog saturation",
  "glassy synthesizers",
  "bowed resonance",
  "room ambience",
  "granular noise",
  "soft tape hiss",
  "dense harmonic layers",
  "dry acoustic detail",
  "filtered noise",
] as const;

const rhythmicHarmonicSuggestions = [
  "syncopated rhythms",
  "slow harmonic movement",
  "repeating ostinatos",
  "suspended harmony",
  "modal harmony",
  "polyrhythmic patterns",
  "half-time grooves",
  "a steady pulse",
  "asymmetric phrasing",
  "drone-based harmony",
  "extended chords",
  "cyclical chord progressions",
] as const;

const roleSuggestions = [
  "a lead voice",
  "a rhythmic anchor",
  "a harmonic foundation",
  "a melodic counterpoint",
  "a source of atmosphere",
  "a textural voice",
  "a conventional accompaniment",
] as const;

const performanceSuggestions = [
  "bowed cello",
  "fingerpicked guitar",
  "close-miked vocal",
  "acoustic piano",
  "distorted electric guitar",
  "live drum performance",
  "synthesizer performance",
  "spoken vocal",
  "bass guitar",
  "sampled vocal fragments",
] as const;

const productionExampleSuggestions = [
  "drum-machine artifacts remain audible beneath the live kit",
  "vocal edits become rhythmic events",
  "room noise is left between phrases",
  "guitar feedback becomes part of the arrangement",
  "filtered noise bridges otherwise separate sections",
  "reversed samples function as transitions",
  "automation reshapes repeated figures over time",
  "distortion is used as an arranging tool rather than decoration",
] as const;

const spatialSuggestions = [
  "space",
  "movement",
  "weight",
  "depth",
  "momentum",
  "scale",
  "pressure",
  "distance",
] as const;

const perspectiveSuggestions = [
  "first-person reflection",
  "a confessional perspective",
  "observational distance",
  "a character study",
  "social commentary",
  "retrospective narration",
  "detached narration",
  "an internal monologue",
  "multiple viewpoints",
  "direct address",
] as const;

const flowSuggestions = [
  "conversational delivery",
  "measured cadence",
  "rapid internal rhyme",
  "melodic phrasing",
  "spoken-word restraint",
  "percussive flow",
  "low-register delivery",
  "layered vocal doubles",
  "detached delivery",
  "confessional delivery",
] as const;

const productionQualitySuggestions = [
  "sparse, sample-led production",
  "dense, distorted production",
  "minimal electronic production",
  "warm soul samples and dry drums",
  "sub-heavy percussion and atmospheric synths",
  "live drums and chopped samples",
  "clean digital production and layered vocals",
  "lo-fi textures and restrained percussion",
] as const;

const portraitSuggestions = [
  "a relationship under strain",
  "a period of transition",
  "a city after dark",
  "an internal conflict",
  "a specific neighborhood",
  "a formative period",
  "a fractured friendship",
  "a private obsession",
  "a changing social environment",
  "a conflict between ambition and doubt",
] as const;

const placeSuggestions = [
  "Orange County",
  "Los Angeles",
  "Southern California",
  "a home-studio setting",
  "a late-night studio environment",
  "a rehearsal room",
  "a small club scene",
  "a suburban landscape",
] as const;

const musicalCharacteristicSuggestions = [
  "interlocking guitar parts",
  "syncopated drum programming",
  "slow harmonic movement",
  "restrained dynamics",
  "melodic bass lines",
  "layered vocal harmonies",
  "repetition with subtle variation",
  "wide stereo space",
  "abrupt dynamic shifts",
  "dense rhythmic layering",
] as const;

const collaboratorCharacteristicSuggestions = [
  "melodic songwriting",
  "rhythmic precision",
  "textural production",
  "lyrical directness",
  "harmonic complexity",
  "improvisational playing",
  "minimal arrangement",
  "dense sound design",
  "raw performance energy",
  "restrained delivery",
] as const;

const contributionSuggestions = [
  "electric guitar",
  "acoustic piano",
  "bowed cello",
  "programmed percussion",
  "live drums",
  "lead vocals",
  "layered harmonies",
  "synthesized textures",
  "sample manipulation",
  "bass guitar",
  "sound design",
  "lyric writing",
  "melodic counterpoint",
  "improvised performance",
] as const;

const periodContextSuggestions = [
  "early songwriting sessions",
  "pre-production",
  "home-demo sessions",
  "rehearsal-room sessions",
  "the period before the final album sessions",
  "an early phase of the project",
  "a transitional period",
  "the first recording sessions",
] as const;

const rawCharacteristicSuggestions = [
  "unfinished vocal takes",
  "rough guitar tones",
  "minimal editing",
  "loose timing",
  "room noise",
  "first-pass arrangements",
  "unpolished performances",
  "temporary production choices",
] as const;

const alternateInstrumentationSuggestions = [
  "alternate guitar voicings",
  "temporary programmed drums",
  "stripped-back instrumentation",
  "guide vocals",
  "acoustic arrangements",
  "alternate synth parts",
  "different bass lines",
  "reduced percussion",
] as const;

const performanceQualitySuggestions = [
  "immediacy",
  "spontaneity",
  "rawness",
  "restraint",
  "tentative energy",
  "informal intimacy",
  "rough-edged focus",
  "unpolished urgency",
] as const;

const musicalBehaviorSuggestions = [
  "repetition with subtle variation",
  "small dynamic shifts",
  "slow harmonic movement",
  "interlocking melodic lines",
  "sustained notes decaying into silence",
  "rhythmic displacement",
  "gradual accumulation of layers",
  "changes in articulation",
  "call-and-response between instruments",
  "melody emerging from texture",
] as const;


// Expanded electronic vocabulary is informed by Beatport's current accepted
// genre/subgenre taxonomy and current/annual chart language. Theory vocabulary
// stays platform-agnostic so it can also serve rock, progressive, hip-hop,
// ambient, acoustic, and experimental releases.
const beatportElectronicGenreSuggestions = [
  "Afro House",
  "Afro / Latin House",
  "3Step",
  "Afro Melodic",
  "Amapiano",
  "Ambient / Experimental",
  "Bass / Club",
  "Juke / Footwork",
  "Global Club",
  "Jersey Club",
  "Gqom",
  "UK Funky",
  "Bass House",
  "Brazilian Funk",
  "Breaks / Breakbeat / UK Bass",
  "Glitch Hop",
  "Dance / Pop",
  "Tropical House",
  "Deep House",
  "Downtempo",
  "Drum & Bass",
  "Liquid Drum & Bass",
  "Jump Up Drum & Bass",
  "Jungle",
  "Deep Drum & Bass",
  "Halftime Drum & Bass",
  "Dubstep",
  "Melodic Dubstep",
  "Midtempo Bass",
  "Electro (Classic / Detroit / Modern)",
  "Electronica",
  "Funky House",
  "Hard Dance / Hardcore / Neo Rave",
  "Hardstyle",
  "Hard House",
  "UK / Happy Hardcore",
  "Frenchcore",
  "Neo Rave",
  "Hard Techno",
  "House",
  "Acid House",
  "Soulful House",
  "Latin House",
  "Indie Dance",
  "Dark Disco",
  "Jackin House",
  "Latin Electronic",
  "Electronic Cumbia",
  "Moombahton",
  "Mainstage",
  "Big Room",
  "Electro House",
  "Future House",
  "Speed House",
  "Future Rave",
  "Melodic House & Techno",
  "Melodic House",
  "Melodic Techno",
  "Minimal / Deep Tech",
  "Deep Tech",
  "Minimal House",
  "Nu Disco / Disco",
  "Italo Disco",
  "Organic House",
  "Progressive House",
  "Psy-Trance",
  "Full-On Psy-Trance",
  "Progressive Psy",
  "Goa Trance",
  "Dark / Forest Psy-Trance",
  "Tech House",
  "Latin Tech",
  "Techno (Peak Time / Driving)",
  "Driving Techno",
  "Psy-Techno",
  "Techno (Raw / Deep / Hypnotic)",
  "Dub Techno",
  "Broken Techno",
  "EBM",
  "Trance (Main Floor)",
  "Progressive Trance",
  "Tech Trance",
  "Hard Trance",
  "Uplifting Trance",
  "Vocal Trance",
  "Raw Trance",
  "Deep Trance",
  "Hypnotic Trance",
  "Trap / Future Bass",
  "UK Garage / Bassline",
  "2-Step Garage",
  "Speed Garage",
] as const;

const electronicDirectionSuggestions = [
  "four-on-the-floor house production",
  "deep and soulful house production",
  "rolling minimal / deep tech grooves",
  "bass-heavy tech house production",
  "peak-time driving techno",
  "raw and hypnotic techno",
  "dub-techno atmosphere",
  "cinematic melodic techno",
  "melodic house songwriting",
  "long-form progressive house development",
  "organic house textures",
  "dark-disco and indie-dance production",
  "nu-disco and Italo-inspired production",
  "acid-house sequencing",
  "mainstage and big-room arrangements",
  "future-rave sound design",
  "uplifting trance songwriting",
  "progressive trance development",
  "vocal trance arrangements",
  "psy-trance sequencing",
  "breakbeat and UK-bass rhythms",
  "2-step garage swing",
  "speed-garage basslines",
  "liquid drum & bass atmosphere",
  "jump-up drum & bass energy",
  "jungle breakbeat programming",
  "halftime bass production",
  "melodic dubstep arrangements",
  "midtempo bass sound design",
  "future-bass chord writing",
  "electro and Detroit-inspired sequencing",
  "ambient electronic composition",
  "IDM-style rhythmic programming",
  "sample-driven electronica",
  "club-focused electronic production",
  "DJ-oriented extended arrangements",
  "build-and-drop song structures",
  "loop-driven arrangement development",
  "synth-led melodic writing",
  "sub-bass-centered production",
  "hybrid acoustic and electronic production",
] as const;

const rockProgressiveDirectionSuggestions = [
  "riff-driven alternative rock",
  "progressive rock composition",
  "progressive metal arrangements",
  "art-rock songwriting",
  "post-rock dynamic development",
  "psychedelic rock textures",
  "shoegaze guitar layering",
  "post-punk rhythmic minimalism",
  "industrial rock production",
  "hard-rock riff writing",
  "grunge-influenced dynamics",
  "math-rock rhythmic interplay",
  "odd-meter progressive writing",
  "through-composed rock arrangements",
  "long-form instrumental development",
  "guitar-and-synth hybrid arrangements",
  "orchestral progressive rock",
  "ambient guitar composition",
  "heavy-light dynamic contrast",
  "polyrhythmic ensemble writing",
] as const;

const theoryDirectionSuggestions = [
  "diatonic harmonic writing",
  "modal harmonic writing",
  "chromatic harmonic writing",
  "pentatonic melodic writing",
  "blues-derived harmony",
  "classical voice leading",
  "counterpoint-driven composition",
  "minimalist repetition",
  "extended tertian harmony",
  "quartal and quintal harmony",
  "diminished and symmetrical harmony",
  "harmonic-minor writing",
  "melodic-minor harmony",
  "whole-tone color",
  "octatonic harmonic color",
  "borrowed-chord and modal-mixture writing",
  "pedal-point harmony",
  "drone-based harmony",
  "non-functional harmonic movement",
  "through-composed development",
] as const;

const electronicElementSuggestions = [
  "four-on-the-floor kick drums",
  "off-beat hi-hats",
  "syncopated percussion",
  "broken-beat drums",
  "Amen-style breakbeats",
  "2-step garage drums",
  "rolling percussion",
  "tribal percussion",
  "log-drum bass lines",
  "Reese bass",
  "acid-style bass sequences",
  "sub-bass pressure",
  "FM bass",
  "wobbling bass modulation",
  "growling bass textures",
  "supersaw stacks",
  "detuned saw chords",
  "arpeggiated synthesizers",
  "sequenced synth motifs",
  "plucked synthesizers",
  "evolving pads",
  "atmospheric pads",
  "vocal chops",
  "pitched vocal samples",
  "granular vocal textures",
  "riser effects",
  "downlifters",
  "impact hits",
  "white-noise sweeps",
  "filtered noise",
  "sidechained synth layers",
  "modular synth textures",
  "resampled percussion",
  "found-sound samples",
] as const;

const rockProgressiveElementSuggestions = [
  "power-chord riffs",
  "palm-muted guitar riffs",
  "clean arpeggiated guitars",
  "octave guitar lines",
  "extended-range guitar riffs",
  "layered distorted guitars",
  "feedback and sustained guitar tones",
  "melodic bass counterpoint",
  "pedal-point bass lines",
  "syncopated unison riffs",
  "odd-meter drum patterns",
  "polyrhythmic drums",
  "tom-driven crescendos",
  "dynamic quiet-to-loud builds",
  "Mellotron-like textures",
  "organ layers",
  "orchestral strings",
  "contrapuntal guitar lines",
] as const;

const electronicInstrumentSuggestions = [
  "modular synthesizer",
  "wavetable synthesizer",
  "FM synthesizer",
  "subtractive synthesizer",
  "sampler",
  "drum sampler",
  "step sequencer",
  "vocoder",
  "talkbox",
  "analog drum machine",
  "digital drum machine",
  "303-style acid synthesizer",
  "modular sequencer",
  "granular sampler",
] as const;

const expandedProductionSuggestions = [
  "sidechain compression",
  "rhythmic sidechain pumping",
  "parallel compression",
  "multiband compression",
  "soft clipping",
  "parallel distortion",
  "transient shaping",
  "noise gating",
  "ducking",
  "kick-and-bass phase alignment",
  "drum layering",
  "sample chopping",
  "time stretching",
  "pitch shifting",
  "resampling",
  "reverse reverb",
  "reverb throws",
  "delay throws",
  "ping-pong delay",
  "dub delay",
  "convolution reverb",
  "filter sweeps",
  "resonant filter automation",
  "envelope modulation",
  "LFO modulation",
  "wavetable synthesis",
  "subtractive synthesis",
  "FM synthesis",
  "additive synthesis",
  "granular synthesis",
  "spectral processing",
  "vocal chopping",
  "vocal formant shifting",
  "vocoding",
  "mid-side processing",
  "stereo widening",
  "mono-compatible bass processing",
  "automation-driven arrangement changes",
  "bitcrushing",
  "sample-rate reduction",
  "tape saturation",
  "console-style saturation",
  "re-amping",
  "parallel ambience",
  "freeze reverb",
  "micro-editing",
  "glitch editing",
] as const;

const theoryCharacteristicSuggestions = [
  "diatonic harmony",
  "functional harmony",
  "modal harmony",
  "chromatic harmony",
  "non-functional harmony",
  "pentatonic melody",
  "blues-scale melody",
  "Dorian modality",
  "Mixolydian modality",
  "Phrygian modality",
  "Lydian modality",
  "Aeolian modality",
  "harmonic-minor harmony",
  "melodic-minor harmony",
  "diminished harmony",
  "augmented harmony",
  "octatonic harmony",
  "whole-tone harmony",
  "quartal harmony",
  "quintal harmony",
  "extended tertian chords",
  "suspended chords",
  "added-note chords",
  "modal mixture",
  "borrowed chords",
  "secondary dominants",
  "chromatic mediants",
  "altered dominant harmony",
  "tritone substitution",
  "circle-of-fifths movement",
  "pedal-point harmony",
  "drone-based harmony",
  "parallel chord planing",
  "contrary-motion voice leading",
  "classical voice leading",
  "counterpoint",
  "imitative counterpoint",
  "ostinato writing",
  "arpeggiated harmony",
  "stepwise melodic motion",
  "wide intervallic melody",
  "sequenced melodic motifs",
  "call-and-response phrasing",
  "syncopation",
  "four-on-the-floor rhythm",
  "half-time rhythm",
  "double-time rhythm",
  "swing and shuffle",
  "triplet groove",
  "polyrhythm",
  "polymeter",
  "hemiola",
  "odd meter",
  "metric displacement",
  "rhythmic displacement",
  "additive rhythm",
  "subtractive arrangement",
  "additive arrangement",
  "through-composed form",
  "build-breakdown-drop form",
  "extended DJ intro and outro",
  "evolving loop form",
] as const;

const expandedQualitySuggestions = [
  "propulsive",
  "hypnotic",
  "driving",
  "rolling",
  "groovy",
  "dancefloor-focused",
  "club-focused",
  "peak-time",
  "euphoric",
  "uplifting",
  "anthemic",
  "immersive",
  "textural",
  "percussive",
  "sub-heavy",
  "bass-forward",
  "pulsing",
  "glitchy",
  "saturated",
  "crystalline",
  "lush",
  "ethereal",
  "weightless",
  "heavy",
  "aggressive",
  "cathartic",
  "cerebral",
  "physical",
  "harmonically rich",
  "harmonically sparse",
  "diatonic",
  "modal",
  "chromatic",
  "dissonant",
  "consonant",
  "pentatonic",
  "polyrhythmic",
  "syncopated",
  "through-composed",
  "riff-driven",
  "progressive",
  "psychedelic",
  "orchestral",
] as const;

const expandedMoodSuggestions = [
  "anticipation",
  "tension",
  "release",
  "catharsis",
  "bittersweetness",
  "awe",
  "dread",
  "wonder",
  "serenity",
  "suspense",
  "defiance",
  "urgency",
  "tenderness",
  "optimism",
  "desolation",
  "exuberance",
  "triumph",
  "vulnerability",
  "transcendence",
  "paranoia",
  "menace",
  "sensuality",
  "disorientation",
] as const;

const expandedThreeAdjectiveSuggestions = [
  "euphoric, melodic, driving",
  "dark, hypnotic, propulsive",
  "lush, cinematic, emotive",
  "minimal, rolling, groovy",
  "raw, percussive, peak-time",
  "deep, spacious, hypnotic",
  "bright, uplifting, anthemic",
  "sub-heavy, syncopated, physical",
  "glitchy, angular, cerebral",
  "warm, soulful, dancefloor-focused",
  "ethereal, melodic, weightless",
  "aggressive, rhythmic, cathartic",
  "mechanical, precise, relentless",
  "organic, percussive, immersive",
  "psychedelic, repetitive, hypnotic",
  "riff-driven, heavy, melodic",
  "progressive, atmospheric, dynamic",
  "intricate, polyrhythmic, expansive",
  "chromatic, tense, dramatic",
  "diatonic, bright, immediate",
] as const;

const theoryIdentitySuggestions = [
  "diatonic clarity with textural production",
  "modal harmony and melodic repetition",
  "chromatic tension and emotional release",
  "pentatonic melody over harmonically ambiguous textures",
  "classical voice leading inside modern production",
  "counterpoint between guitar and synthesizer",
  "progressive development through recurring motifs",
  "rhythmic complexity without sacrificing melody",
  "odd-meter writing with a strong melodic center",
  "extended harmony framed by direct songwriting",
  "the tension between consonance and dissonance",
  "the tension between repetition and harmonic change",
] as const;

const electronicIdentitySuggestions = [
  "melodic storytelling through electronic production",
  "club-focused rhythm with introspective songwriting",
  "cinematic sound design and emotional directness",
  "hypnotic repetition with gradual development",
  "the tension between dancefloor momentum and melancholy",
  "the contrast between synthetic precision and human performance",
  "bass-driven production with melodic restraint",
  "progressive arrangement and long-form tension",
  "percussive detail and immersive atmosphere",
  "euphoric release built from restrained tension",
] as const;

const expandedOpeningSuggestions = [
  "a filtered synth introduction",
  "a DJ-friendly drum intro",
  "a kickless ambient opening",
  "an arpeggiated synth figure",
  "a sub-bass pulse",
  "a broken-beat intro",
  "a delayed guitar motif",
  "a pedal-point riff",
  "a modal piano figure",
  "a gradually opening low-pass filter",
] as const;

const expandedPayoffSuggestions = [
  "a bass-heavy drop",
  "a euphoric supersaw release",
  "a second-drop variation",
  "a full four-on-the-floor groove",
  "a breakbeat switch",
  "a half-time breakdown",
  "an extended progressive climax",
  "a key-change lift",
  "a chromatic climax",
  "a polyrhythmic full-band section",
] as const;

const expandedProductionExampleSuggestions = [
  "sidechain compression turns sustained chords into a rhythmic pulse",
  "filter automation gradually reveals the harmonic layers",
  "resampled drums become new percussion textures",
  "a reverb throw transforms the final word of each phrase",
  "kick and bass are arranged as a single low-frequency gesture",
  "the second drop changes the bass rhythm rather than simply adding layers",
  "granular processing turns vocal fragments into atmosphere",
  "parallel distortion adds density while preserving the dry transient",
  "mid-side processing keeps the low end centered while widening the upper layers",
  "a sequenced arpeggio changes voicing as the harmony moves underneath it",
] as const;

const expandedProductionQualitySuggestions = [
  "rolling basslines and tight stripped-back grooves",
  "cinematic builds and dramatic sound design",
  "lush progressive textures and gradual melodic development",
  "crisp percussion and deep synth swells",
  "four-on-the-floor drums and resonant bass",
  "broken beats and sub-heavy low end",
  "euphoric synth stacks and sidechained chords",
  "hypnotic sequencing and restrained harmonic movement",
  "raw percussion and abrasive synthesis",
  "warm pads, soulful vocals, and understated drums",
  "polyrhythmic percussion and evolving sound design",
] as const;

const expandedMusicalBehaviorSuggestions = [
  "diatonic voice leading",
  "chromatic voice leading",
  "modal interchange",
  "counterpoint between independent lines",
  "ostinato development",
  "sequenced motif variation",
  "arpeggio inversion changes",
  "pedal-point tension",
  "diminished passing harmony",
  "pentatonic melodic variation",
  "polyrhythmic layering",
  "metric displacement",
  "odd-meter phrase extension",
  "build-and-drop tension cycles",
  "filter-driven timbral development",
  "automation-driven changes in density",
] as const;


const expandedReleaseMeaningSuggestions = [
  "a shift from song-focused writing toward club-oriented production",
  "a move from loop-based sketches toward fully developed arrangements",
  "a move from guitar-led writing toward a hybrid electronic palette",
  "a transition from straightforward harmony toward more modal and chromatic writing",
  "a first sustained exploration of dancefloor-oriented production",
  "a bridge between progressive-rock composition and electronic production",
  "a refinement of the project's rhythmic and harmonic language",
  "a more deliberate balance of melody, sound design, and groove",
] as const;

const expandedChangeSuggestions = [
  "a shift toward club-oriented production",
  "a move toward more electronic instrumentation",
  "a move toward longer progressive arrangements",
  "a shift toward heavier rhythmic programming",
  "a move toward more cinematic sound design",
  "a move toward more harmonically adventurous writing",
  "a shift toward modal and chromatic harmony",
  "a move toward stripped-back dancefloor arrangements",
  "a move toward denser progressive-rock instrumentation",
  "a focus on synthesis and resampling",
  "a focus on groove and repetition",
  "a focus on counterpoint and voice leading",
] as const;


// Rock / alternative / indie / psychedelic vocabulary is informed by a
// 100-release indie-rock corpus plus broader rock, punk, shoegaze,
// psychedelic, progressive, and artist-specific reference research. Keep the
// stored vocabulary descriptive rather than artist-named so it remains useful
// across the catalog.
const expandedRockGenreSuggestions = [
  "classic rock",
  "hard rock",
  "arena rock",
  "blues rock",
  "roots rock",
  "southern rock",
  "garage rock",
  "garage punk",
  "alternative rock",
  "indie rock",
  "indie pop",
  "college rock",
  "jangle pop",
  "lo-fi indie rock",
  "noise rock",
  "noise pop",
  "dream pop",
  "shoegaze",
  "slowcore",
  "post-rock",
  "post-punk",
  "dance-punk",
  "punk rock",
  "hardcore punk",
  "post-hardcore",
  "pop punk",
  "emo",
  "art rock",
  "progressive rock",
  "neo-prog",
  "progressive metal",
  "math rock",
  "psychedelic rock",
  "neo-psychedelia",
  "psychedelic pop",
  "psychedelic garage rock",
  "acid rock",
  "space rock",
  "stoner rock",
  "krautrock",
  "glam rock",
  "gothic rock",
  "new wave",
  "synth-rock",
  "electronic rock",
  "synth-punk",
  "industrial rock",
  "industrial metal",
  "electro-industrial",
  "rap rock",
  "rap-metal",
  "trip-hop",
  "downbeat",
  "acid jazz",
  "dub",
  "lounge",
  "bossa nova",
] as const;

const expandedRockDirectionSuggestions = [
  "garage-rock immediacy",
  "raw rehearsal-room rock",
  "live-room alternative rock",
  "riff-first hard-rock songwriting",
  "hook-forward indie rock",
  "jangle-pop guitar writing",
  "lo-fi indie recording",
  "noise-rock abrasion",
  "shoegaze wall-of-sound guitar layering",
  "dream-pop atmosphere",
  "post-punk angularity",
  "dance-punk rhythmic drive",
  "grunge loud-quiet dynamics",
  "punk-speed brevity",
  "hardcore intensity",
  "post-hardcore dynamic contrast",
  "synth-punk collision",
  "industrial-punk production",
  "electronic-rock hybrid arrangements",
  "psychedelic studio experimentation",
  "neo-psychedelic pop writing",
  "acid-rock improvisation",
  "space-rock expansiveness",
  "krautrock repetition",
  "post-rock crescendo structures",
  "progressive-metal technicality",
  "suite-like progressive composition",
  "odd-meter progressive development",
  "virtuosic progressive arrangements",
  "jam-oriented improvisation",
  "blues-rock riffing",
  "arena-scale anthem writing",
  "cinematic trip-hop atmosphere",
  "dub-informed downtempo production",
  "synth-heavy melodic pop",
  "fuzz-driven electronic pop",
  "long-form progressive-house development",
] as const;

const expandedRockElementSuggestions = [
  "jangly clean guitars",
  "fuzz guitar",
  "octave fuzz",
  "wah-wah guitar",
  "phaser-treated guitars",
  "flanged guitars",
  "chorus-soaked guitars",
  "tremolo guitar",
  "reverse guitar textures",
  "feedback drones",
  "amp feedback",
  "open-string riffs",
  "pedal-tone riffs",
  "chromatic guitar riffs",
  "blues-pentatonic riffs",
  "minor-pentatonic riffs",
  "unison guitar-and-bass lines",
  "guitar harmonics",
  "tapped guitar figures",
  "extended instrumental solos",
  "Mellotron textures",
  "Hammond-style organ",
  "Leslie-speaker organ",
  "sitar",
  "drone tones",
  "tape loops",
  "studio sound collage",
  "live-room drum ambience",
  "cymbal wash",
  "tom-heavy drums",
  "driving eighth-note bass",
  "melodic bass countermelodies",
  "loose pocket",
  "staccato post-punk guitar",
  "dissonant guitar clusters",
  "noise bursts",
  "wall-of-sound guitar layers",
  "slow cinematic breakbeats",
  "vinyl-textured drum loops",
  "dub basslines",
  "echoing keyboard stabs",
  "fuzz-pulsing synthesizers",
  "fluorescent synth layers",
] as const;

const expandedRockInstrumentSuggestions = [
  "12-string electric guitar",
  "baritone guitar",
  "fretless bass",
  "Mellotron",
  "Hammond-style organ",
  "electric organ",
  "sitar",
  "tambura-style drone",
  "Wurlitzer electric piano",
  "Rhodes electric piano",
  "tape machine",
  "spring-reverb tank",
  "Leslie speaker",
  "fuzz pedal",
  "wah pedal",
  "analog tape echo",
] as const;

const expandedRockProductionSuggestions = [
  "live-room bleed",
  "room-mic-heavy drum recording",
  "close-and-room microphone blending",
  "double-tracked guitars",
  "quad-tracked rhythm guitars",
  "amp saturation",
  "fuzz distortion",
  "overdrive",
  "spring reverb",
  "plate reverb",
  "slapback delay",
  "tape echo",
  "dub-style delay feedback",
  "chorus modulation",
  "flanging",
  "phasing",
  "Leslie-speaker modulation",
  "wah filtering",
  "automatic double tracking",
  "vocal doubling",
  "stacked vocal harmonies",
  "parallel drum compression",
  "drum-bus saturation",
  "gated room drums",
  "DI and re-amped guitar blending",
  "feedback riding",
  "varispeed recording",
  "reverse tape",
  "tape loops",
  "cassette saturation",
  "vinyl crackle and sampled ambience",
  "sample-layered live drums",
  "low-pass filtered breakbeats",
  "crisp dry breakbeats",
  "deliberate pockets of silence",
  "lo-fi blown-speaker distortion",
] as const;

const expandedRockTheorySuggestions = [
  "power-chord harmony",
  "riff-based harmony",
  "minor-pentatonic melody",
  "major-pentatonic melody",
  "blues-pentatonic melody",
  "Mixolydian rock harmony",
  "Dorian vamp",
  "modal riffing",
  "chromatic riffing",
  "pedal-tone riffing",
  "drone-based modal harmony",
  "parallel power-chord movement",
  "open-string pedal harmony",
  "thematic reprise",
  "leitmotif development",
  "suite form",
  "episodic form",
  "loud-quiet-loud form",
  "riff-and-refrain form",
  "extended instrumental development",
  "metric modulation",
  "mixed meter",
  "compound meter",
  "odd-meter shifts",
  "syncopated accents",
  "backbeat emphasis",
  "straight-eighth rock pulse",
  "shuffle groove",
  "swing eighths",
  "unison rhythmic hits",
  "phrase extension",
  "sequence-based development",
  "contrary-motion guitar lines",
  "chromatic mediant movement",
  "deceptive cadence",
  "tritone-centered riffing",
] as const;

const expandedAttitudeMoodSuggestions = [
  "attitude",
  "swagger",
  "defiance",
  "rebelliousness",
  "irreverence",
  "insolence",
  "audacity",
  "brashness",
  "cockiness",
  "mischief",
  "provocation",
  "confrontation",
  "anti-authoritarian energy",
  "recklessness",
  "restless energy",
  "spontaneity",
  "live-wire energy",
  "adrenaline",
  "danger",
  "edginess",
  "impulsiveness",
  "rowdiness",
  "wildness",
  "sarcasm",
  "sardonic humor",
  "playful antagonism",
  "frustration",
  "rage",
  "angst",
  "yearning",
  "romantic tension",
  "melancholic introspection",
  "alienated cool",
  "paranoid tension",
  "transportive wonder",
  "hallucinatory unease",
] as const;

const expandedAttitudeQualitySuggestions = [
  "rebellious",
  "defiant",
  "swaggering",
  "brash",
  "cocky",
  "irreverent",
  "provocative",
  "confrontational",
  "anti-authoritarian",
  "edgy",
  "dangerous",
  "reckless",
  "unruly",
  "wild",
  "unhinged",
  "mischievous",
  "sardonic",
  "sarcastic",
  "restless",
  "impulsive",
  "spontaneous",
  "live",
  "live-wire",
  "loose",
  "human",
  "immediate",
  "visceral",
  "rowdy",
  "sweaty",
  "kinetic",
  "explosive",
  "ferocious",
  "scabrous",
  "gritty",
  "rough-edged",
  "fuzzed-out",
  "jangly",
  "noisy",
  "discordant",
  "dissonant",
  "anthemic",
  "hooky",
  "widescreen",
  "transportive",
  "hallucinatory",
  "kaleidoscopic",
  "trippy",
  "woozy",
  "lysergic",
  "cosmic",
  "noirish",
  "haunting",
  "broody",
  "sleazy",
  "theatrical",
  "over-the-top",
] as const;

const expandedRockPerformanceSuggestions = [
  "spontaneous live-band performance",
  "first-take energy",
  "loose ensemble interplay",
  "room-driven ensemble performance",
  "improvisational interplay",
  "jam-oriented performance",
  "human push-and-pull timing",
  "aggressive downstroke guitar",
  "percussive rhythm guitar",
  "virtuosic soloing",
  "technical ensemble precision",
  "unison instrumental runs",
  "extended instrumental passages",
  "theatrical vocal delivery",
  "sneering vocal delivery",
  "shouted vocals",
  "breathy intimate vocals",
  "haunting vocal delivery",
  "urgent vocal delivery",
  "raw vocal doubles",
  "stacked vocal harmonies",
  "dynamic quiet-to-loud performance",
] as const;

const expandedRockSongwritingSuggestions = [
  "riff-first songwriting",
  "hook-forward songwriting",
  "chorus-driven songwriting",
  "anthemic songwriting",
  "loud-quiet-loud dynamics",
  "episodic songwriting",
  "suite-like composition",
  "through-composed progressive writing",
  "thematic reprise",
  "motif recurrence",
  "jam-derived arrangement",
  "improvisational development",
  "mantra-like repetition",
  "psychedelic repetition",
  "stream-of-consciousness writing",
  "angular post-punk writing",
  "minimalist indie songwriting",
  "intimate singer-songwriter framing",
  "cinematic trip-hop songwriting",
  "short-form punk economy",
] as const;

const expandedRockIdentitySuggestions = [
  "raw live-band immediacy",
  "rebellious energy with melodic hooks",
  "the tension between attitude and vulnerability",
  "the contrast between live spontaneity and studio detail",
  "guitar abrasion around direct melody",
  "psychedelic texture anchored by concise songwriting",
  "progressive complexity with an emotional center",
  "technical precision without losing ensemble energy",
  "odd-meter complexity with memorable hooks",
  "the contrast between cinematic atmosphere and rhythmic grit",
  "downtempo groove with dub-informed space",
  "haunting vocals over crisp, spacious breakbeats",
  "synth-heavy melody with fuzzed-out edges",
  "electronic precision with rock-derived aggression",
] as const;

const expandedRockThreeAdjectiveSuggestions = [
  "rebellious, melodic, raw",
  "spontaneous, live, visceral",
  "edgy, hooky, urgent",
  "brash, kinetic, confrontational",
  "swaggering, gritty, anthemic",
  "loose, noisy, immediate",
  "fuzzed-out, psychedelic, hypnotic",
  "kaleidoscopic, melodic, transportive",
  "woozy, nocturnal, cinematic",
  "noirish, haunting, spacious",
  "angular, restless, propulsive",
  "jangly, bittersweet, intimate",
  "dissonant, heavy, cathartic",
  "virtuosic, intricate, dramatic",
  "progressive, technical, emotive",
  "sleazy, theatrical, electronic",
  "buoyant, fluorescent, synth-heavy",
] as const;

const expandedRockVisualSuggestions = [
  "neon-lit",
  "back-alley",
  "basement-show",
  "club-lit",
  "feedback-soaked",
  "kaleidoscopic",
  "hallucinatory",
  "cosmic",
  "lysergic",
  "noirish",
  "cinematic",
  "smoke-filled",
  "strobe-lit",
  "sun-bleached",
  "dusty",
  "claustrophobic",
] as const;


const expandedRockOpeningSuggestions = [
  "a feedback swell",
  "a clean guitar arpeggio",
  "a count-in and live-room bleed",
  "a drum pickup",
  "a single distorted riff",
  "a bass-led intro",
  "a phased guitar figure",
  "a tape-loop atmosphere",
  "a Mellotron wash",
  "a hushed vocal opening",
] as const;

const expandedRockPayoffSuggestions = [
  "a full-band crash",
  "a feedback-drenched climax",
  "an extended guitar solo",
  "a double-time final chorus",
  "a half-time breakdown",
  "a wall-of-sound chorus",
  "an instrumental coda",
  "a sudden stripped-back ending",
  "a unison progressive-rock passage",
  "a key-change final refrain",
] as const;

const expandedRockRawSuggestions = [
  "amp bleed",
  "count-in chatter",
  "live-room noise",
  "first-take vocals",
  "tempo drift",
  "pick noise",
  "stick clicks",
  "feedback tails",
  "unmuted string noise",
  "rough monitor mixes",
] as const;

const expandedRockContextSuggestions = [
  "live rehearsal sessions",
  "a first full-band recording",
  "a period of rehearsal-room experimentation",
  "a shift from demos toward live ensemble recording",
  "a move from guitar sketches toward full arrangements",
  "a period of psychedelic studio experimentation",
  "a transition into more progressive composition",
  "a deliberate return to raw live performance",
] as const;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function includesAny(
  normalized: string,
  values: readonly string[],
): boolean {
  return values.some((value) => normalized === value);
}

export function getReleaseAboutPlaceholders(
  template: string,
): string[] {
  const placeholders: string[] = [];
  const matcher = /\[([^\]]+)\]/g;

  for (const match of template.matchAll(matcher)) {
    const placeholder = match[1]?.trim();

    if (
      placeholder &&
      !placeholders.includes(placeholder)
    ) {
      placeholders.push(placeholder);
    }
  }

  return placeholders;
}

export function buildReleaseAboutDescription(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(
    /\[([^\]]+)\]/g,
    (fullMatch, placeholder: string) => {
      const value = values[placeholder]?.trim();
      return value || fullMatch;
    },
  );
}

export function getReleaseAboutSuggestions(
  placeholder: string,
): string[] {
  const normalized = placeholder.toLowerCase();
  const suggestions: string[] = [];

  if (
    includesAny(normalized, [
      "primary musical element",
      "contrasting element",
      "primary sound",
      "secondary sound",
      "sound a",
      "sound b",
      "sound c",
      "old element",
      "sound detail 1",
      "sound detail 2",
      "other element",
      "element a",
      "element b",
      "element 1",
      "element 2",
      "element 3",
      "sound source",
    ])
  ) {
    suggestions.push(
      ...musicalElementSuggestions,
      ...electronicElementSuggestions,
      ...rockProgressiveElementSuggestions,
      ...expandedRockElementSuggestions,
      ...theoryCharacteristicSuggestions,
      ...expandedRockTheorySuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "instrument / production characteristic",
      "new influence / production / instrumentation",
    ])
  ) {
    suggestions.push(
      ...musicalElementSuggestions,
      ...electronicElementSuggestions,
      ...rockProgressiveElementSuggestions,
      ...expandedRockElementSuggestions,
      ...productionSuggestions,
      ...expandedProductionSuggestions,
      ...expandedRockProductionSuggestions,
      ...genreInfluenceSuggestions,
      ...beatportElectronicGenreSuggestions,
      ...expandedRockGenreSuggestions,
      ...expandedRockDirectionSuggestions,
      ...theoryDirectionSuggestions,
      ...expandedRockTheorySuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "riff / beat / instrument",
      "vocal / instrument",
      "instrument / sound",
      "instrument 1",
      "instrument 2",
      "instrumentation",
    ])
  ) {
    suggestions.push(
      ...instrumentSuggestions,
      ...electronicInstrumentSuggestions,
      ...expandedRockInstrumentSuggestions,
      ...musicalElementSuggestions,
      ...electronicElementSuggestions,
      ...rockProgressiveElementSuggestions,
      ...expandedRockElementSuggestions,
    );
  }

  if (normalized === "instrument / performance") {
    suggestions.push(
      ...performanceSuggestions,
      ...expandedRockPerformanceSuggestions,
      ...electronicInstrumentSuggestions,
      ...expandedRockInstrumentSuggestions,
      ...electronicElementSuggestions,
      ...rockProgressiveElementSuggestions,
      ...expandedRockElementSuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "production feature",
      "production detail",
      "production technique 1",
      "production technique 2",
    ])
  ) {
    suggestions.push(
      ...productionSuggestions,
      ...expandedProductionSuggestions,
      ...expandedRockProductionSuggestions,
    );
  }

  if (normalized === "production qualities") {
    suggestions.push(
      ...productionQualitySuggestions,
      ...expandedProductionQualitySuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "genre / type",
      "genre",
      "influence a",
      "influence b",
      "reference category a",
      "reference category b",
      "local / style influence",
      "unexpected influence",
      "genre / form",
    ])
  ) {
    suggestions.push(
      ...genreInfluenceSuggestions,
      ...beatportElectronicGenreSuggestions,
      ...expandedRockGenreSuggestions,
    );
  }

  if (normalized === "earlier artistic direction") {
    suggestions.push(
      ...artisticDirectionSuggestions,
      ...electronicDirectionSuggestions,
      ...rockProgressiveDirectionSuggestions,
      ...expandedRockDirectionSuggestions,
      ...theoryDirectionSuggestions,
    );
  }

  if (normalized === "new direction") {
    suggestions.push(
      ...newDirectionSuggestions,
      ...electronicDirectionSuggestions,
      ...rockProgressiveDirectionSuggestions,
      ...expandedRockDirectionSuggestions,
      ...theoryDirectionSuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "mood a",
      "mood b",
      "subject / emotion",
      "emotion",
    ])
  ) {
    suggestions.push(
      ...moodSuggestions,
      ...expandedMoodSuggestions,
      ...expandedAttitudeMoodSuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "characteristic",
      "contrasting characteristic",
      "quality",
      "quality 1",
      "quality 2",
      "quality 3",
      "quality a",
      "apparently contradictory quality b",
      "quality b",
      "opposite a",
      "opposite b",
      "opposite",
      "experience 1",
      "experience 2",
    ])
  ) {
    suggestions.push(
      ...qualitySuggestions,
      ...expandedQualitySuggestions,
      ...expandedAttitudeQualitySuggestions,
    );
  }

  if (normalized === "three-adjective") {
    suggestions.push(
      ...threeAdjectiveSuggestions,
      ...expandedThreeAdjectiveSuggestions,
      ...expandedRockThreeAdjectiveSuggestions,
    );
  }

  if (normalized === "opening quality") {
    suggestions.push(
      ...openingQualitySuggestions,
      ...expandedOpeningSuggestions,
      ...expandedRockOpeningSuggestions,
    );
  }

  if (normalized === "payoff") {
    suggestions.push(
      ...payoffSuggestions,
      ...expandedPayoffSuggestions,
      ...expandedRockPayoffSuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "theme",
      "themes",
      "theme 1",
      "theme 2",
      "subject",
      "central idea",
    ])
  ) {
    suggestions.push(...themeSuggestions);
  }

  if (
    includesAny(normalized, [
      "core identity",
      "artist a characteristic",
      "artist b characteristic",
    ])
  ) {
    suggestions.push(
      ...identitySuggestions,
      ...theoryIdentitySuggestions,
      ...electronicIdentitySuggestions,
      ...expandedRockIdentitySuggestions,
      ...collaboratorCharacteristicSuggestions,
    );
  }

  if (
    normalized ===
    "concise statement about what the release represents"
  ) {
    suggestions.push(
      ...releaseMeaningSuggestions,
      ...expandedReleaseMeaningSuggestions,
    );
  }

  if (normalized === "change / exploration") {
    suggestions.push(
      ...changeSuggestions,
      ...expandedChangeSuggestions,
      ...expandedRockDirectionSuggestions,
      ...expandedRockContextSuggestions,
    );
  }

  if (normalized === "number") {
    suggestions.push(
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    );
  }

  if (normalized === "distinctive feature") {
    suggestions.push(
      ...distinctiveFeatureSuggestions,
      ...theoryCharacteristicSuggestions,
      ...expandedRockTheorySuggestions,
      ...electronicElementSuggestions,
      ...expandedRockElementSuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "visual adjective 1",
      "visual adjective 2",
    ])
  ) {
    suggestions.push(
      ...visualAdjectiveSuggestions,
      ...expandedRockVisualSuggestions,
    );
  }

  if (normalized === "texture") {
    suggestions.push(
      ...textureSuggestions,
      ...electronicElementSuggestions,
      ...rockProgressiveElementSuggestions,
      ...expandedRockElementSuggestions,
    );
  }

  if (
    normalized ===
    "rhythmic / harmonic characteristic"
  ) {
    suggestions.push(
      ...rhythmicHarmonicSuggestions,
      ...theoryCharacteristicSuggestions,
      ...expandedRockTheorySuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "conventional role",
      "interesting role",
    ])
  ) {
    suggestions.push(...roleSuggestions);
  }

  if (normalized === "specific example") {
    suggestions.push(
      ...productionExampleSuggestions,
      ...expandedProductionExampleSuggestions,
    );
  }

  if (
    normalized ===
    "simple / direct / restrained quality"
  ) {
    suggestions.push(
      "simple",
      "direct",
      "restrained",
      "minimal",
      "spare",
      "melodic",
    );
  }

  if (normalized === "space / movement / weight") {
    suggestions.push(...spatialSuggestions);
  }

  if (normalized === "perspective") {
    suggestions.push(...perspectiveSuggestions);
  }

  if (normalized === "flow / vocal quality") {
    suggestions.push(...flowSuggestions);
  }

  if (
    normalized === "person / place / time / conflict"
  ) {
    suggestions.push(...portraitSuggestions);
  }

  if (normalized === "place") {
    suggestions.push(...placeSuggestions);
  }

  if (
    normalized === "specific musical characteristic"
  ) {
    suggestions.push(
      ...musicalCharacteristicSuggestions,
      ...theoryCharacteristicSuggestions,
      ...expandedRockTheorySuggestions,
      ...electronicElementSuggestions,
      ...rockProgressiveElementSuggestions,
      ...expandedRockElementSuggestions,
    );
  }

  if (
    includesAny(normalized, [
      "specific contribution a",
      "specific contribution b",
    ])
  ) {
    suggestions.push(
      ...contributionSuggestions,
      ...electronicInstrumentSuggestions,
      ...expandedRockInstrumentSuggestions,
      ...electronicElementSuggestions,
      ...expandedRockElementSuggestions,
    );
  }

  if (normalized === "period / context") {
    suggestions.push(
      ...periodContextSuggestions,
      ...expandedRockContextSuggestions,
    );
  }

  if (normalized === "raw characteristic") {
    suggestions.push(
      ...rawCharacteristicSuggestions,
      ...expandedRockRawSuggestions,
    );
  }

  if (normalized === "alternate instrumentation") {
    suggestions.push(
      ...alternateInstrumentationSuggestions,
      ...electronicInstrumentSuggestions,
      ...expandedRockInstrumentSuggestions,
      ...electronicElementSuggestions,
      ...rockProgressiveElementSuggestions,
      ...expandedRockElementSuggestions,
    );
  }

  if (normalized === "performance quality") {
    suggestions.push(
      ...performanceQualitySuggestions,
      ...expandedRockPerformanceSuggestions,
      ...expandedAttitudeQualitySuggestions,
    );
  }

  if (normalized === "specific musical behavior") {
    suggestions.push(
      ...musicalBehaviorSuggestions,
      ...expandedMusicalBehaviorSuggestions,
      ...theoryCharacteristicSuggestions,
      ...expandedRockTheorySuggestions,
      ...expandedRockSongwritingSuggestions,
    );
  }

  return unique(suggestions);
}

export type ReleaseProfileCategoryId =
  | "genres"
  | "influences"
  | "direction"
  | "elements"
  | "instrumentation"
  | "production"
  | "harmony-theory"
  | "rhythm"
  | "moods-emotions"
  | "qualities"
  | "themes"
  | "songwriting"
  | "identity"
  | "performance"
  | "context"
  | "place";

export type ReleaseProfileSelection = Partial<
  Record<ReleaseProfileCategoryId, readonly string[]>
>;

export type ReleaseProfileCategory = {
  id: ReleaseProfileCategoryId;
  label: string;
  description: string;
  options: readonly string[];
};

const songwritingProfileSuggestions = [
  "emotionally direct songwriting",
  "melodic songwriting",
  "lyrical introspection",
  "narrative songwriting",
  "conventional song forms",
  "through-composed writing",
  "motif-driven composition",
  "repetition with gradual development",
  "verse-chorus songwriting",
  "long-form progressive development",
  "minimalist songwriting",
  "confessional writing",
  "character-driven storytelling",
  "instrumental composition",
  "melody-first writing",
  "rhythm-first writing",
] as const;

const rhythmProfileSuggestions = [
  "four-on-the-floor rhythm",
  "syncopation",
  "half-time rhythm",
  "double-time rhythm",
  "swing and shuffle",
  "triplet groove",
  "polyrhythm",
  "polymeter",
  "hemiola",
  "odd meter",
  "metric displacement",
  "rhythmic displacement",
  "additive rhythm",
  "broken-beat drums",
  "2-step garage drums",
  "rolling percussion",
  "Amen-style breakbeats",
  "straight eighth-note pulse",
  "steady quarter-note pulse",
  "syncopated unison riffs",
  "odd-meter drum patterns",
] as const;

const performanceProfileSuggestions = unique([
  ...performanceSuggestions,
  ...performanceQualitySuggestions,
  ...flowSuggestions,
  "live-band performance",
  "layered ensemble performance",
  "improvised performance",
  "tightly programmed performance",
  "restrained delivery",
  "aggressive delivery",
  ...expandedRockPerformanceSuggestions,
  ...expandedAttitudeQualitySuggestions,
]);

export const releaseProfileCategories: readonly ReleaseProfileCategory[] = [
  {
    id: "genres",
    label: "Genres & subgenres",
    description: "Primary genre, subgenre, and scene vocabulary.",
    options: unique([
      ...genreInfluenceSuggestions,
      ...beatportElectronicGenreSuggestions,
      ...expandedRockGenreSuggestions,
    ]),
  },
  {
    id: "influences",
    label: "Influences",
    description: "Stylistic, compositional, and production reference points.",
    options: unique([
      ...genreInfluenceSuggestions,
      ...beatportElectronicGenreSuggestions,
      ...theoryDirectionSuggestions,
      ...rockProgressiveDirectionSuggestions,
      ...expandedRockDirectionSuggestions,
      ...expandedRockGenreSuggestions,
      ...electronicDirectionSuggestions,
    ]),
  },
  {
    id: "direction",
    label: "Artistic direction",
    description: "How the release is oriented or how the project is changing.",
    options: unique([
      ...artisticDirectionSuggestions,
      ...newDirectionSuggestions,
      ...electronicDirectionSuggestions,
      ...rockProgressiveDirectionSuggestions,
      ...expandedRockDirectionSuggestions,
      ...theoryDirectionSuggestions,
      ...expandedChangeSuggestions,
    ]),
  },
  {
    id: "elements",
    label: "Musical elements",
    description: "Riffs, textures, rhythmic devices, and recurring sonic material.",
    options: unique([
      ...musicalElementSuggestions,
      ...electronicElementSuggestions,
      ...rockProgressiveElementSuggestions,
      ...expandedRockElementSuggestions,
      ...textureSuggestions,
      ...distinctiveFeatureSuggestions,
    ]),
  },
  {
    id: "instrumentation",
    label: "Instrumentation",
    description: "Instruments, synthesis tools, and recurring sound sources.",
    options: unique([
      ...instrumentSuggestions,
      ...electronicInstrumentSuggestions,
      ...expandedRockInstrumentSuggestions,
      ...performanceSuggestions,
      ...expandedRockPerformanceSuggestions,
      ...contributionSuggestions,
    ]),
  },
  {
    id: "production",
    label: "Production",
    description: "Recording, mixing, synthesis, editing, and sound-design techniques.",
    options: unique([
      ...productionSuggestions,
      ...expandedProductionSuggestions,
      ...expandedRockProductionSuggestions,
      ...productionQualitySuggestions,
      ...expandedProductionQualitySuggestions,
    ]),
  },
  {
    id: "harmony-theory",
    label: "Harmony & theory",
    description: "Harmony, scales, voice leading, form, and compositional language.",
    options: unique([
      ...theoryCharacteristicSuggestions,
      ...expandedRockTheorySuggestions,
      ...rhythmicHarmonicSuggestions,
      ...theoryDirectionSuggestions,
    ]),
  },
  {
    id: "rhythm",
    label: "Rhythm & meter",
    description: "Groove, meter, rhythmic feel, and temporal organization.",
    options: unique([
      ...rhythmProfileSuggestions,
      ...expandedRockTheorySuggestions.filter((value) =>
        /meter|rhythm|pulse|backbeat|shuffle|swing|syncopated|hits/i.test(value),
      ),
      ...electronicElementSuggestions.filter((value) =>
        /drum|rhythm|percussion|breakbeat|kick|hi-hat/i.test(value),
      ),
      ...expandedRockElementSuggestions.filter((value) =>
        /drum|cymbal|pocket|eighth-note|unison/i.test(value),
      ),
    ]),
  },
  {
    id: "moods-emotions",
    label: "Mood & emotion",
    description: "Emotional subjects and the atmosphere perceived by the listener.",
    options: unique([
      ...moodSuggestions,
      ...expandedMoodSuggestions,
      ...expandedAttitudeMoodSuggestions,
      ...visualAdjectiveSuggestions,
      ...expandedRockVisualSuggestions,
    ]),
  },
  {
    id: "qualities",
    label: "Sonic qualities",
    description: "Adjectives describing density, energy, character, and feel.",
    options: unique([
      ...qualitySuggestions,
      ...expandedQualitySuggestions,
      ...expandedAttitudeQualitySuggestions,
    ]),
  },
  {
    id: "themes",
    label: "Themes & subjects",
    description: "Recurring lyrical, narrative, or conceptual concerns.",
    options: unique([
      ...themeSuggestions,
      ...portraitSuggestions,
    ]),
  },
  {
    id: "songwriting",
    label: "Songwriting & composition",
    description: "How songs are written, structured, and developed.",
    options: unique([
      ...songwritingProfileSuggestions,
      ...expandedRockSongwritingSuggestions,
    ]),
  },
  {
    id: "identity",
    label: "Core identity",
    description: "High-level phrases describing what makes the project feel like itself.",
    options: unique([
      ...identitySuggestions,
      ...theoryIdentitySuggestions,
      ...electronicIdentitySuggestions,
      ...expandedRockIdentitySuggestions,
      ...collaboratorCharacteristicSuggestions,
    ]),
  },
  {
    id: "performance",
    label: "Performance",
    description: "Performance approach, delivery, and instrumental role.",
    options: performanceProfileSuggestions,
  },
  {
    id: "context",
    label: "Release context",
    description: "Career stage, change, recording period, and what the release represents.",
    options: unique([
      ...releaseMeaningSuggestions,
      ...expandedReleaseMeaningSuggestions,
      ...changeSuggestions,
      ...expandedChangeSuggestions,
      ...expandedRockDirectionSuggestions,
      ...periodContextSuggestions,
      ...expandedRockContextSuggestions,
    ]),
  },
  {
    id: "place",
    label: "Place / scene",
    description: "Geographic or scene context when it materially shapes the release.",
    options: placeSuggestions,
  },
];

const releaseProfileCategoryById = new Map(
  releaseProfileCategories.map((category) => [category.id, category]),
);

export function getReleaseProfileCategory(
  categoryId: ReleaseProfileCategoryId,
): ReleaseProfileCategory {
  const category = releaseProfileCategoryById.get(categoryId);

  if (!category) {
    throw new Error(`Unknown release profile category: ${categoryId}`);
  }

  return category;
}

export function getReleaseAboutProfileCategoryIds(
  placeholder: string,
): ReleaseProfileCategoryId[] {
  const normalized = placeholder.toLowerCase();
  const categories: ReleaseProfileCategoryId[] = [];
  const add = (...ids: ReleaseProfileCategoryId[]) => {
    for (const id of ids) {
      if (!categories.includes(id)) {
        categories.push(id);
      }
    }
  };

  if (
    includesAny(normalized, [
      "primary musical element",
      "contrasting element",
      "primary sound",
      "secondary sound",
      "sound a",
      "sound b",
      "sound c",
      "old element",
      "sound detail 1",
      "sound detail 2",
      "other element",
      "element a",
      "element b",
      "element 1",
      "element 2",
      "element 3",
      "sound source",
      "texture",
      "distinctive feature",
    ])
  ) {
    add("elements", "instrumentation", "harmony-theory");
  }

  if (
    includesAny(normalized, [
      "instrument / production characteristic",
      "new influence / production / instrumentation",
    ])
  ) {
    add("influences", "production", "instrumentation", "elements");
  }

  if (
    includesAny(normalized, [
      "riff / beat / instrument",
      "vocal / instrument",
      "instrument / sound",
      "instrument 1",
      "instrument 2",
      "instrumentation",
      "alternate instrumentation",
      "instrument / performance",
    ])
  ) {
    add("instrumentation", "elements", "performance");
  }

  if (
    includesAny(normalized, [
      "production feature",
      "production detail",
      "production technique 1",
      "production technique 2",
      "production qualities",
      "specific example",
    ])
  ) {
    add("production");
  }

  if (
    includesAny(normalized, [
      "genre / type",
      "genre",
      "influence a",
      "influence b",
      "reference category a",
      "reference category b",
      "local / style influence",
      "unexpected influence",
      "genre / form",
    ])
  ) {
    add("genres", "influences");
  }

  if (
    includesAny(normalized, [
      "earlier artistic direction",
      "new direction",
      "change / exploration",
    ])
  ) {
    add("direction", "context");
  }

  if (
    includesAny(normalized, [
      "mood a",
      "mood b",
      "subject / emotion",
      "emotion",
      "visual adjective 1",
      "visual adjective 2",
    ])
  ) {
    add("moods-emotions", "qualities");
  }

  if (
    includesAny(normalized, [
      "characteristic",
      "contrasting characteristic",
      "quality",
      "quality 1",
      "quality 2",
      "quality 3",
      "quality a",
      "apparently contradictory quality b",
      "quality b",
      "opposite a",
      "opposite b",
      "opposite",
      "experience 1",
      "experience 2",
      "opening quality",
      "payoff",
      "three-adjective",
      "simple / direct / restrained quality",
      "performance quality",
    ])
  ) {
    add("qualities", "moods-emotions");
  }

  if (
    includesAny(normalized, [
      "theme",
      "themes",
      "theme 1",
      "theme 2",
      "subject",
      "central idea",
    ])
  ) {
    add("themes", "identity");
  }

  if (
    includesAny(normalized, [
      "core identity",
      "artist a characteristic",
      "artist b characteristic",
    ])
  ) {
    add("identity", "songwriting");
  }

  if (
    normalized === "concise statement about what the release represents"
  ) {
    add("context", "identity");
  }

  if (normalized === "rhythmic / harmonic characteristic") {
    add("harmony-theory", "rhythm");
  }

  if (
    includesAny(normalized, [
      "conventional role",
      "interesting role",
      "flow / vocal quality",
    ])
  ) {
    add("performance", "songwriting");
  }

  if (normalized === "perspective") {
    add("songwriting", "themes");
  }

  if (normalized === "person / place / time / conflict") {
    add("context", "place", "themes");
  }

  if (normalized === "place") {
    add("place", "context");
  }

  if (normalized === "specific musical characteristic") {
    add("elements", "harmony-theory", "rhythm");
  }

  if (
    includesAny(normalized, [
      "specific contribution a",
      "specific contribution b",
    ])
  ) {
    add("instrumentation", "production", "elements");
  }

  if (
    includesAny(normalized, [
      "period / context",
      "raw characteristic",
    ])
  ) {
    add("context", "production", "qualities");
  }

  if (normalized === "specific musical behavior") {
    add("harmony-theory", "rhythm", "elements", "songwriting");
  }

  if (normalized === "space / movement / weight") {
    add("qualities", "production");
  }

  return categories;
}

export function getReleaseAboutProfileSuggestions(
  placeholder: string,
  profile: ReleaseProfileSelection,
): string[] {
  const normalized = placeholder.toLowerCase();

  if (
    includesAny(normalized, [
      "artist",
      "release",
      "artist a",
      "artist b",
      "number",
    ])
  ) {
    return [];
  }

  if (normalized === "three-adjective") {
    const adjectiveCandidates = unique([
      ...(profile.qualities ?? []),
      ...(profile["moods-emotions"] ?? []),
    ]);
    const combined =
      adjectiveCandidates.length >= 3
        ? [adjectiveCandidates.slice(0, 3).join(", ")]
        : [];

    return unique([
      ...combined,
      ...adjectiveCandidates,
    ]);
  }

  return unique(
    getReleaseAboutProfileCategoryIds(placeholder).flatMap(
      (categoryId) => profile[categoryId] ?? [],
    ),
  );
}

function releaseAboutSlotIndex(placeholder: string): number {
  const normalized = placeholder.toLowerCase();
  const numeric = normalized.match(/(?:^|\s)([123])$/);

  if (numeric) {
    return Number(numeric[1]) - 1;
  }

  const letter = normalized.match(/(?:^|\s)([abc])$/);
  if (letter) {
    return { a: 0, b: 1, c: 2 }[letter[1] as "a" | "b" | "c"];
  }

  if (/secondary|contrasting|new influence/.test(normalized)) {
    return 1;
  }

  return 0;
}

export function prefillReleaseAboutValuesFromProfile(
  template: string,
  values: Readonly<Record<string, string>>,
  profile: ReleaseProfileSelection,
): Record<string, string> {
  const next = { ...values };

  for (const placeholder of getReleaseAboutPlaceholders(template)) {
    if (next[placeholder]?.trim()) {
      continue;
    }

    if (
      includesAny(placeholder.toLowerCase(), [
        "artist",
        "release",
        "artist a",
        "artist b",
        "number",
      ])
    ) {
      continue;
    }

    const categoryIds = getReleaseAboutProfileCategoryIds(placeholder);
    const candidates = unique(
      categoryIds.flatMap((categoryId) => profile[categoryId] ?? []),
    );

    if (placeholder.toLowerCase() === "three-adjective") {
      const adjectiveCandidates = unique([
        ...(profile.qualities ?? []),
        ...(profile["moods-emotions"] ?? []),
      ]).slice(0, 3);

      if (adjectiveCandidates.length === 3) {
        next[placeholder] = adjectiveCandidates.join(", ");
      }

      continue;
    }

    const candidate = candidates[releaseAboutSlotIndex(placeholder)] ?? candidates[0];
    if (candidate) {
      next[placeholder] = candidate;
    }
  }

  return next;
}

export function countReleaseProfileSelections(
  profile: ReleaseProfileSelection,
): number {
  return Object.values(profile).reduce(
    (total, values) => total + (values?.length ?? 0),
    0,
  );
}

