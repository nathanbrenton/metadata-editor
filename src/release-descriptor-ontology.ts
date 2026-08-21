export type ReleaseDescriptorCategoryId =
  | "genre"
  | "influence"
  | "direction"
  | "element"
  | "instrumentation"
  | "production"
  | "theory"
  | "rhythm"
  | "mood"
  | "attitude"
  | "energy"
  | "sonic-quality"
  | "theme"
  | "songwriting"
  | "identity"
  | "performance"
  | "context"
  | "place";

export type ReleaseDescriptorLevel =
  | "common"
  | "advanced";

export type ReleaseDescriptorSourceFamily =
  | "beatport"
  | "rock-corpus"
  | "music-theory"
  | "gems"
  | "artist-reference"
  | "editorial";

export type ReleaseDescriptor = {
  id: string;
  label: string;
  category: ReleaseDescriptorCategoryId;
  family: string;
  subfamily: string;
  level: ReleaseDescriptorLevel;
  aliases?: readonly string[];
  searchTerms?: readonly string[];
  related?: readonly string[];
  sourceFamilies: readonly ReleaseDescriptorSourceFamily[];
};

export type ReleaseDescriptorCategoryDefinition = {
  id: ReleaseDescriptorCategoryId;
  label: string;
  description: string;
};

type ReleaseDescriptorGroup = {
  category: ReleaseDescriptorCategoryId;
  family: string;
  subfamily: string;
  level: ReleaseDescriptorLevel;
  sourceFamilies: readonly ReleaseDescriptorSourceFamily[];
  labels: readonly string[];
};

export const releaseDescriptorCategoryDefinitions:
  readonly ReleaseDescriptorCategoryDefinition[] = [
  { id: "genre", label: "Genre & subgenre", description: "Canonical genre and subgenre labels used for classification and browsing." },
  { id: "influence", label: "Influences", description: "Stylistic, compositional, production, cultural, and cinematic reference points." },
  { id: "direction", label: "Artistic direction", description: "How the release is oriented or how the project's sound is changing." },
  { id: "element", label: "Musical elements", description: "Recurring riffs, textures, rhythmic devices, hooks, and sonic material." },
  { id: "instrumentation", label: "Instrumentation", description: "Instruments, synthesis tools, voices, and recurring sound sources." },
  { id: "production", label: "Production", description: "Recording, mixing, synthesis, editing, effects, and sound-design techniques." },
  { id: "theory", label: "Music theory", description: "Tonality, scales, harmony, voice leading, melody, and formal organization." },
  { id: "rhythm", label: "Rhythm & meter", description: "Meter, groove, subdivision, rhythmic feel, and temporal organization." },
  { id: "mood", label: "Mood & emotion", description: "Music-induced affect organized around musically useful emotional families." },
  { id: "attitude", label: "Attitude", description: "Defiance, swagger, irreverence, edge, and social posture." },
  { id: "energy", label: "Energy & motion", description: "Perceived intensity, momentum, restraint, and dynamic arc." },
  { id: "sonic-quality", label: "Sonic qualities", description: "Density, space, surface texture, polish, and tonal character." },
  { id: "theme", label: "Themes & subjects", description: "Recurring lyrical, narrative, conceptual, and imagistic concerns." },
  { id: "songwriting", label: "Songwriting & composition", description: "Song form, development, lyric approach, and ensemble writing." },
  { id: "identity", label: "Core identity", description: "High-level phrases describing the musical identity of a project or release." },
  { id: "performance", label: "Performance", description: "Spontaneity, precision, delivery, and ensemble interaction." },
  { id: "context", label: "Release context", description: "Career stage, stylistic change, recording circumstance, and archival context." },
  { id: "place", label: "Place & scene", description: "Geographic, scene, studio, or imagined environmental context." },
];

export const releaseDescriptorSourceFamilyDescriptions: Readonly<Record<ReleaseDescriptorSourceFamily, string>> = {
  "beatport": "Beatport's current accepted genre/subgenre taxonomy and electronic-release ecosystem.",
  "rock-corpus": "Rock, indie, punk, progressive, psychedelic, and shoegaze release/editorial corpora.",
  "music-theory": "Formal music-theory terminology and classification.",
  "gems": "Geneva Emotional Music Scale families and music-specific affect terminology.",
  "artist-reference": "Cross-genre vocabulary prompted by the user's named artist references.",
  "editorial": "General release-writing/editorial vocabulary distilled from successful release copy.",
};

const releaseDescriptorGroups: readonly ReleaseDescriptorGroup[] = [
  {
    category: "genre",
    family: "Electronic",
    subfamily: "House",
    level: "common",
    sourceFamilies: ["beatport"],
    labels: [
      "House",
      "Deep House",
      "Funky House",
      "Jackin House",
      "Organic House",
      "Progressive House",
      "Tech House",
      "Bass House",
      "Afro House",
      "Melodic House",
      "Minimal House",
      "Soulful House",
      "Latin House",
      "Tropical House",
      "Future House",
      "Speed House",
      "Electro House",
      "Melodic House & Techno",
    ],
  },
  {
    category: "genre",
    family: "Electronic",
    subfamily: "Techno",
    level: "common",
    sourceFamilies: ["beatport"],
    labels: [
      "Techno",
      "Hard Techno",
      "Peak Time Techno",
      "Driving Techno",
      "Psy-Techno",
      "Deep / Hypnotic Techno",
      "Raw Techno",
      "EBM Techno",
      "Dub Techno",
      "Broken Techno",
      "Melodic Techno",
      "Techno (Peak Time / Driving)",
      "Techno (Raw / Deep / Hypnotic)",
    ],
  },
  {
    category: "genre",
    family: "Electronic",
    subfamily: "Trance & Psy",
    level: "common",
    sourceFamilies: ["beatport"],
    labels: [
      "Trance",
      "Progressive Trance",
      "Tech Trance",
      "Hard Trance",
      "Uplifting Trance",
      "Vocal Trance",
      "Raw Trance",
      "Deep Trance",
      "Hypnotic Trance",
      "Psy-Trance",
      "Full-On Psy-Trance",
      "Progressive Psy",
      "Goa Trance",
      "Dark / Forest Psy-Trance",
      "Psycore",
      "H-Tech",
      "Trance (Main Floor)",
      "Trance (Raw / Deep / Hypnotic)",
    ],
  },
  {
    category: "genre",
    family: "Electronic",
    subfamily: "Breaks, garage & bass",
    level: "common",
    sourceFamilies: ["beatport"],
    labels: [
      "Breaks / Breakbeat / UK Bass",
      "UK Garage",
      "Bassline",
      "2-Step",
      "Speed Garage",
      "Drum & Bass",
      "Liquid Drum & Bass",
      "Jump Up Drum & Bass",
      "Jungle",
      "Deep Drum & Bass",
      "Halftime Drum & Bass",
      "Dubstep",
      "Melodic Dubstep",
      "Midtempo Bass",
      "140 / Deep Dubstep / Grime",
      "Grime",
      "Trap",
      "Future Bass",
      "Bass / Club",
      "Juke / Footwork",
      "Jersey Club",
      "UK Funky",
      "UK Garage / Bassline",
      "Trap / Future Bass",
    ],
  },
  {
    category: "genre",
    family: "Electronic",
    subfamily: "Disco, dance & club",
    level: "common",
    sourceFamilies: ["beatport"],
    labels: [
      "Indie Dance",
      "Dark Disco",
      "Nu Disco",
      "Disco",
      "Dance / Pop",
      "Mainstage",
      "Big Room",
      "Future Rave",
      "Electro",
      "Electronica",
      "Ambient / Experimental",
      "Downtempo",
      "Minimal / Deep Tech",
      "Deep Tech",
      "Amapiano",
      "3Step",
      "Afro Melodic",
      "Gqom",
      "Moombahton",
      "Hard Dance / Hardcore / Neo Rave",
    ],
  },
  {
    category: "genre",
    family: "Electronic",
    subfamily: "Experimental & hybrid",
    level: "advanced",
    sourceFamilies: ["beatport", "artist-reference"],
    labels: [
      "IDM",
      "Glitch Hop",
      "Ambient Techno",
      "Experimental Techno",
      "Electro-Industrial",
      "Industrial Dance",
      "Trip-Hop",
      "Acid Jazz",
      "Downbeat",
      "Lounge Electronica",
      "Dub Electronica",
      "Electropunk",
      "Synth-Punk",
      "Indie Electronic",
      "Left-Field Electronic",
    ],
  },
  {
    category: "genre",
    family: "Rock",
    subfamily: "Alternative & indie",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "Alternative Rock",
      "Indie Rock",
      "College Rock",
      "Jangle Pop",
      "Power Pop",
      "Noise Rock",
      "Slowcore",
      "Sadcore",
      "Lo-Fi Indie",
      "Emo",
      "Post-Hardcore",
      "Post-Punk",
      "Goth Rock",
      "Dream Pop",
      "Shoegaze",
      "Grunge",
      "Post-Grunge",
      "Garage Rock",
      "Garage Punk",
      "Art Rock",
      "Experimental Rock",
      "Dance-Rock",
      "Funk Rock",
      "Industrial Rock",
      "Electronic Rock",
      "Synth-Rock",
    ],
  },
  {
    category: "genre",
    family: "Rock",
    subfamily: "Progressive & mathematical",
    level: "common",
    sourceFamilies: ["rock-corpus", "artist-reference"],
    labels: [
      "Progressive Rock",
      "Neo-Prog",
      "Progressive Metal",
      "Symphonic Prog",
      "Canterbury Scene",
      "Math Rock",
      "Post-Rock",
      "Krautrock",
      "Art Metal",
      "Djent",
    ],
  },
  {
    category: "genre",
    family: "Rock",
    subfamily: "Psychedelic & expansive",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "Psychedelic Rock",
      "Neo-Psychedelia",
      "Acid Rock",
      "Heavy Psych",
      "Psychedelic Pop",
      "Space Rock",
      "Raga Rock",
      "Drone Rock",
      "Stoner Rock",
      "Desert Rock",
      "Freak Folk",
    ],
  },
  {
    category: "genre",
    family: "Rock",
    subfamily: "Punk & hard rock",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "Punk Rock",
      "Hardcore Punk",
      "Pop Punk",
      "Ska Punk",
      "Riot Grrrl",
      "Garage Punk",
      "Hard Rock",
      "Heavy Metal",
      "Alternative Metal",
      "Industrial Metal",
      "Rap Metal",
    ],
  },
  {
    category: "genre",
    family: "Adjacent",
    subfamily: "Black music & songwriting",
    level: "common",
    sourceFamilies: ["editorial", "artist-reference"],
    labels: [
      "Hip-Hop",
      "Alternative Hip-Hop",
      "East Coast Hip-Hop",
      "West Coast Hip-Hop",
      "Southern Hip-Hop",
      "R&B",
      "Soul",
      "Funk",
      "Jazz",
      "Cool Jazz",
      "Soul Jazz",
      "Bossa Nova",
      "Reggae",
      "Dub",
      "Ska",
      "Singer-Songwriter",
      "Folk",
      "Chamber Pop",
      "Baroque Pop",
    ],
  },
  {
    category: "genre",
    family: "Adjacent",
    subfamily: "Classical & cinematic",
    level: "common",
    sourceFamilies: ["editorial", "music-theory"],
    labels: [
      "Classical",
      "Chamber Music",
      "Minimalism",
      "Contemporary Classical",
      "Film Score",
      "Soundtrack Music",
      "Ambient",
      "Drone",
      "Experimental Pop",
    ],
  },
  {
    category: "influence",
    family: "Rock references",
    subfamily: "Guitar traditions",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "alternative rock",
      "indie rock",
      "progressive rock",
      "psychedelic rock",
      "post-punk",
      "punk rock",
      "shoegaze",
      "dream pop",
      "noise rock",
      "garage rock",
      "art rock",
      "post-rock",
      "math rock",
      "hard rock",
      "progressive metal",
      "grunge",
      "new wave",
      "krautrock",
    ],
  },
  {
    category: "influence",
    family: "Electronic references",
    subfamily: "Club & studio traditions",
    level: "common",
    sourceFamilies: ["beatport", "artist-reference"],
    labels: [
      "progressive house",
      "deep house",
      "melodic techno",
      "techno",
      "trance",
      "drum & bass",
      "jungle",
      "UK garage",
      "breakbeat",
      "IDM",
      "trip-hop",
      "electronica",
      "ambient",
      "dub techno",
      "acid house",
      "electro-industrial",
      "synth-pop",
      "indie electronic",
      "downtempo",
    ],
  },
  {
    category: "influence",
    family: "Rhythmic & global references",
    subfamily: "Groove traditions",
    level: "common",
    sourceFamilies: ["artist-reference", "editorial"],
    labels: [
      "dub",
      "reggae",
      "bossa nova",
      "samba",
      "Latin jazz",
      "acid jazz",
      "cool jazz",
      "soul",
      "funk",
      "hip-hop",
      "breakbeat culture",
      "dancehall",
      "Afrobeat",
      "Afro house",
      "Indian classical music",
      "raga",
      "minimalism",
    ],
  },
  {
    category: "influence",
    family: "Cinematic references",
    subfamily: "Image & atmosphere",
    level: "common",
    sourceFamilies: ["artist-reference", "editorial"],
    labels: [
      "film noir",
      "spy soundtracks",
      "cinematic scoring",
      "horror soundtracks",
      "science-fiction scoring",
      "library music",
      "lounge music",
      "cabaret",
      "orchestral scoring",
      "ambient sound design",
    ],
  },
  {
    category: "influence",
    family: "Compositional references",
    subfamily: "Theory & form",
    level: "advanced",
    sourceFamilies: ["music-theory", "rock-corpus"],
    labels: [
      "classical counterpoint",
      "jazz harmony",
      "modal harmony",
      "minimalist process music",
      "through-composed form",
      "suite writing",
      "concept-album form",
      "improvisation",
      "motivic development",
      "odd-meter progressive writing",
    ],
  },
  {
    category: "direction",
    family: "Electronic evolution",
    subfamily: "Club-facing",
    level: "common",
    sourceFamilies: ["beatport", "artist-reference"],
    labels: [
      "toward a more electronic sound",
      "toward club-oriented production",
      "toward progressive house",
      "toward melodic techno",
      "toward deeper house grooves",
      "toward broken-beat production",
      "toward bass-driven electronic music",
      "toward ambient electronic soundscapes",
      "toward synth-heavy arrangements",
      "toward sample-based production",
      "toward a darker electronic palette",
      "toward a more euphoric dance sound",
      "toward extended electronic structures",
      "toward a stripped-back minimal club sound",
      "toward live instrumentation inside electronic production",
      "toward synth-heavy atmospheric pop",
    ],
  },
  {
    category: "direction",
    family: "Rock evolution",
    subfamily: "Guitar-facing",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "toward heavier guitar music",
      "toward raw live-band performances",
      "toward atmospheric alternative rock",
      "toward progressive rock arrangements",
      "toward psychedelic studio experimentation",
      "toward denser guitar textures",
      "toward cleaner guitar arrangements",
      "toward post-rock dynamics",
      "toward shoegaze texture",
      "toward punk immediacy",
      "toward art-rock experimentation",
      "toward a more melodic rock sound",
      "toward a more abrasive rock sound",
      "toward longer progressive forms",
    ],
  },
  {
    category: "direction",
    family: "Composition",
    subfamily: "Writing & harmony",
    level: "common",
    sourceFamilies: ["music-theory", "rock-corpus"],
    labels: [
      "toward greater harmonic complexity",
      "toward more diatonic songwriting",
      "toward more chromatic harmony",
      "toward modal writing",
      "toward odd-meter composition",
      "toward more conventional song structures",
      "toward through-composed forms",
      "toward motif-driven composition",
      "toward extended instrumental development",
      "toward more concise songwriting",
      "toward narrative songwriting",
      "toward instrumental composition",
    ],
  },
  {
    category: "direction",
    family: "Scale & intimacy",
    subfamily: "Arrangement character",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "toward more spacious arrangements",
      "toward a more intimate sound",
      "toward a more cinematic sound",
      "toward a more organic palette",
      "toward a more synthetic palette",
      "toward a nocturnal atmosphere",
      "toward a brighter melodic palette",
      "toward a darker atmosphere",
      "toward greater rhythmic emphasis",
      "toward more spontaneous performances",
      "toward tighter studio precision",
      "toward lo-fi immediacy",
    ],
  },
  {
    category: "element",
    family: "Guitar",
    subfamily: "Riffs & textures",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "distorted guitar riffs",
      "clean guitar arpeggios",
      "jangling guitars",
      "fuzz guitar",
      "feedback-drenched guitars",
      "wall-of-guitars texture",
      "interlocking guitar lines",
      "palm-muted riffs",
      "down-tuned guitar chugs",
      "angular guitar figures",
      "chiming guitar voicings",
      "slide guitar textures",
      "sustained guitar drones",
      "harmonized guitar leads",
      "counterpoint guitar lines",
      "single-note ostinato riffs",
      "power-chord movement",
      "open-string drones",
    ],
  },
  {
    category: "element",
    family: "Keys & harmony",
    subfamily: "Keyboard material",
    level: "common",
    sourceFamilies: ["rock-corpus", "artist-reference"],
    labels: [
      "acoustic piano figures",
      "electric piano chords",
      "Mellotron layers",
      "Hammond organ",
      "synthesizer arpeggios",
      "analog synth pads",
      "digital synth textures",
      "sequenced synthesizer lines",
      "piano ostinatos",
      "organ drones",
      "synth bass",
      "supersaw chords",
      "acid basslines",
    ],
  },
  {
    category: "element",
    family: "Rhythm",
    subfamily: "Beat & groove material",
    level: "common",
    sourceFamilies: ["beatport", "rock-corpus"],
    labels: [
      "live drum grooves",
      "electronic percussion",
      "drum-machine patterns",
      "four-on-the-floor kick",
      "broken breakbeats",
      "2-step garage drums",
      "Amen-style breaks",
      "half-time drums",
      "shuffle groove",
      "syncopated unison hits",
      "rolling percussion",
      "polyrhythmic percussion",
      "motorik pulse",
      "punk backbeat",
      "tribal percussion",
      "sub-bass pulse",
      "sidechained kick-and-bass movement",
      "slow breakbeats",
      "IDM-derived beats",
    ],
  },
  {
    category: "element",
    family: "Texture",
    subfamily: "Atmospheric material",
    level: "common",
    sourceFamilies: ["editorial", "artist-reference"],
    labels: [
      "sustained drones",
      "ambient field recordings",
      "vinyl texture",
      "tape hiss",
      "noise beds",
      "reversed textures",
      "granular clouds",
      "sampled dialogue",
      "found sound",
      "reverberant ambience",
      "swelling feedback",
      "orchestral pads",
      "string swells",
      "choir layers",
      "dub echoes",
      "noir-jazz textures",
      "spy-soundtrack gestures",
      "hypnotic samples",
      "cinematic sample collage",
    ],
  },
  {
    category: "element",
    family: "Voice",
    subfamily: "Vocal material",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "close-miked vocals",
      "layered vocal harmonies",
      "spoken-word passages",
      "whispered vocals",
      "shouted vocals",
      "gang vocals",
      "call-and-response vocals",
      "processed vocal chops",
      "breathy lead vocals",
      "detached vocal delivery",
      "melodic rap phrasing",
    ],
  },
  {
    category: "instrumentation",
    family: "Guitars & bass",
    subfamily: "Strings with frets",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "electric guitar",
      "acoustic guitar",
      "12-string guitar",
      "baritone guitar",
      "bass guitar",
      "fretless bass",
      "lap steel guitar",
      "pedal steel",
      "mandolin",
      "electric mandolin",
      "sitar",
    ],
  },
  {
    category: "instrumentation",
    family: "Keyboards",
    subfamily: "Acoustic & electric keys",
    level: "common",
    sourceFamilies: ["rock-corpus", "artist-reference"],
    labels: [
      "acoustic piano",
      "electric piano",
      "Rhodes",
      "Wurlitzer",
      "Hammond organ",
      "pipe organ",
      "Mellotron",
      "clavinet",
      "harpsichord",
    ],
  },
  {
    category: "instrumentation",
    family: "Electronic",
    subfamily: "Synthesis & sampling",
    level: "common",
    sourceFamilies: ["beatport", "artist-reference"],
    labels: [
      "analog synthesizer",
      "digital synthesizer",
      "modular synthesizer",
      "FM synthesizer",
      "wavetable synthesizer",
      "sampler",
      "drum machine",
      "step sequencer",
      "groovebox",
      "MIDI-controlled instruments",
      "sub-bass synthesizer",
    ],
  },
  {
    category: "instrumentation",
    family: "Drums & percussion",
    subfamily: "Acoustic percussion",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "drum kit",
      "live drums",
      "electronic drum pads",
      "timpani",
      "congas",
      "bongos",
      "tambourine",
      "shaker",
      "handclaps",
      "cymbal swells",
      "mallet percussion",
      "vibraphone",
      "marimba",
    ],
  },
  {
    category: "instrumentation",
    family: "Orchestral",
    subfamily: "Strings, winds & brass",
    level: "common",
    sourceFamilies: ["artist-reference", "editorial"],
    labels: [
      "cello",
      "violin",
      "viola",
      "double bass",
      "string quartet",
      "orchestral strings",
      "flute",
      "clarinet",
      "saxophone",
      "trumpet",
      "trombone",
      "French horn",
      "woodwind ensemble",
      "brass ensemble",
    ],
  },
  {
    category: "instrumentation",
    family: "Voice & source audio",
    subfamily: "Human & found sound",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "lead voice",
      "layered vocals",
      "choir",
      "spoken voice",
      "vocal samples",
      "field recordings",
      "found sound",
      "sampled dialogue",
      "turntables",
    ],
  },
  {
    category: "production",
    family: "Recording",
    subfamily: "Capture & room",
    level: "common",
    sourceFamilies: ["rock-corpus", "artist-reference"],
    labels: [
      "live-room recording",
      "room bleed",
      "close-miking",
      "dry close-miking",
      "ambient room mics",
      "single-room ensemble tracking",
      "live-off-the-floor tracking",
      "overdub-heavy production",
      "home-studio recording",
      "lo-fi recording",
      "high-fidelity studio recording",
      "re-amping",
      "amp-room ambience",
      "DI bass recording",
      "double-tracked guitars",
      "multi-tracked vocals",
    ],
  },
  {
    category: "production",
    family: "Dynamics",
    subfamily: "Compression & transients",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "parallel compression",
      "bus compression",
      "sidechain compression",
      "sidechain ducking",
      "transient shaping",
      "limiting",
      "upward compression",
      "pumping compression",
    ],
  },
  {
    category: "production",
    family: "Spatial effects",
    subfamily: "Reverb & delay",
    level: "common",
    sourceFamilies: ["artist-reference", "rock-corpus"],
    labels: [
      "plate reverb",
      "spring reverb",
      "hall reverb",
      "room reverb",
      "reverse reverb",
      "gated reverb",
      "slapback delay",
      "tape delay",
      "dub delay",
      "ping-pong delay",
      "feedback delay",
      "pre-delay shaping",
      "wide stereo ambience",
      "mono ambience",
      "automated spatial movement",
    ],
  },
  {
    category: "production",
    family: "Tone",
    subfamily: "Distortion & saturation",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "tape saturation",
      "tube saturation",
      "amp distortion",
      "fuzz distortion",
      "overdrive",
      "bitcrushing",
      "soft clipping",
      "hard clipping",
      "speaker breakup",
      "lo-fi filtering",
    ],
  },
  {
    category: "production",
    family: "Synthesis",
    subfamily: "Sound design",
    level: "advanced",
    sourceFamilies: ["beatport"],
    labels: [
      "subtractive synthesis",
      "FM synthesis",
      "wavetable synthesis",
      "granular synthesis",
      "additive synthesis",
      "resampling",
      "sample chopping",
      "sample manipulation",
      "time-stretching",
      "pitch-shifting",
      "vocoder processing",
      "formant shifting",
      "ring modulation",
      "frequency shifting",
      "noise layering",
      "LFO modulation",
      "filter automation",
      "arpeggiator sequencing",
      "layered supersaws",
      "Reese bass design",
    ],
  },
  {
    category: "production",
    family: "Mixing",
    subfamily: "Stereo, EQ & balance",
    level: "advanced",
    sourceFamilies: ["editorial"],
    labels: [
      "mid-side processing",
      "stereo widening",
      "narrow mono imaging",
      "subtractive EQ",
      "dynamic EQ",
      "multiband compression",
      "parallel distortion",
      "automation-driven mixing",
      "frequency carving",
      "low-end mono control",
      "surgical filtering",
      "creative phase manipulation",
    ],
  },
  {
    category: "production",
    family: "Editing",
    subfamily: "Arrangement & manipulation",
    level: "common",
    sourceFamilies: ["beatport", "editorial"],
    labels: [
      "hard edits",
      "micro-edits",
      "stutter edits",
      "glitch editing",
      "reverse edits",
      "dropout edits",
      "loop-based construction",
      "sample collage",
      "cut-up arrangement",
      "tempo automation",
      "varispeed",
      "tape-stop effects",
      "beat slicing",
    ],
  },
  {
    category: "theory",
    family: "Tonality & scales",
    subfamily: "Core tonalities",
    level: "common",
    sourceFamilies: ["music-theory"],
    labels: [
      "major tonality",
      "natural minor tonality",
      "harmonic minor",
      "melodic minor",
      "major pentatonic",
      "minor pentatonic",
      "blues scale",
      "chromatic scale",
    ],
  },
  {
    category: "theory",
    family: "Tonality & scales",
    subfamily: "Modes",
    level: "common",
    sourceFamilies: ["music-theory"],
    labels: [
      "Ionian mode",
      "Dorian mode",
      "Phrygian mode",
      "Lydian mode",
      "Mixolydian mode",
      "Aeolian mode",
      "Locrian mode",
    ],
  },
  {
    category: "theory",
    family: "Tonality & scales",
    subfamily: "Synthetic & jazz scales",
    level: "advanced",
    sourceFamilies: ["music-theory"],
    labels: [
      "whole-tone scale",
      "octatonic half-whole scale",
      "octatonic whole-half scale",
      "altered scale",
      "Lydian dominant",
      "Locrian sharp 2",
      "Lydian augmented",
      "Mixolydian flat 6",
      "bebop dominant scale",
      "bebop major scale",
      "hexatonic scale",
    ],
  },
  {
    category: "theory",
    family: "Harmony",
    subfamily: "Diatonic & functional",
    level: "common",
    sourceFamilies: ["music-theory"],
    labels: [
      "diatonic harmony",
      "functional harmony",
      "triadic harmony",
      "seventh-chord harmony",
      "tonic-dominant motion",
      "circle-of-fifths motion",
      "plagal motion",
      "pedal-point harmony",
      "suspended harmony",
      "power-chord harmony",
    ],
  },
  {
    category: "theory",
    family: "Harmony",
    subfamily: "Chromatic & borrowed",
    level: "advanced",
    sourceFamilies: ["music-theory"],
    labels: [
      "modal mixture",
      "borrowed chords",
      "secondary dominants",
      "secondary diminished chords",
      "diminished seventh harmony",
      "Neapolitan harmony",
      "augmented-sixth harmony",
      "chromatic mediant relationships",
      "enharmonic modulation",
      "chromatic voice leading",
      "chromatic harmony",
    ],
  },
  {
    category: "theory",
    family: "Harmony",
    subfamily: "Extended & non-tertian",
    level: "advanced",
    sourceFamilies: ["music-theory"],
    labels: [
      "tertian harmony",
      "quartal harmony",
      "quintal harmony",
      "secundal harmony",
      "extended jazz harmony",
      "cluster harmony",
      "polychordal harmony",
      "pandiatonic harmony",
      "harmonic planing",
      "harmonic ambiguity",
      "non-functional harmony",
    ],
  },
  {
    category: "theory",
    family: "Voice leading",
    subfamily: "Counterpoint & line",
    level: "advanced",
    sourceFamilies: ["music-theory"],
    labels: [
      "classical voice leading",
      "smooth voice leading",
      "chromatic voice leading",
      "contrary motion",
      "parallel motion",
      "oblique motion",
      "counterpoint",
      "imitative counterpoint",
      "canon",
      "contrapuntal layering",
      "inner-voice motion",
      "common-tone voice leading",
    ],
  },
  {
    category: "theory",
    family: "Melody",
    subfamily: "Motif & interval",
    level: "common",
    sourceFamilies: ["music-theory", "rock-corpus"],
    labels: [
      "motivic development",
      "sequence",
      "melodic inversion",
      "augmentation",
      "diminution",
      "retrograde",
      "ostinato",
      "call and response",
      "stepwise melody",
      "angular melody",
      "wide-interval melody",
      "scalar melody",
      "arpeggiated melody",
      "pedal-tone melody",
    ],
  },
  {
    category: "theory",
    family: "Form",
    subfamily: "Formal organization",
    level: "common",
    sourceFamilies: ["music-theory", "rock-corpus"],
    labels: [
      "verse-chorus form",
      "strophic form",
      "through-composed form",
      "binary form",
      "ternary form",
      "rondo-like form",
      "suite form",
      "multi-part form",
      "conceptual song cycle",
      "thematic reprise",
      "cyclical form",
      "extended instrumental form",
    ],
  },
  {
    category: "rhythm",
    family: "Meter",
    subfamily: "Basic meter",
    level: "common",
    sourceFamilies: ["music-theory", "rock-corpus"],
    labels: [
      "common time",
      "cut time",
      "triple meter",
      "compound meter",
      "6/8 feel",
      "12/8 feel",
      "odd meter",
      "mixed meter",
      "changing meter",
      "additive meter",
    ],
  },
  {
    category: "rhythm",
    family: "Groove",
    subfamily: "Rock & song feel",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "straight eighth-note pulse",
      "straight sixteenth-note pulse",
      "backbeat",
      "half-time feel",
      "double-time feel",
      "shuffle",
      "swing",
      "triplet groove",
      "motorik pulse",
      "punk drive",
      "laid-back pocket",
      "behind-the-beat feel",
      "on-top-of-the-beat feel",
      "syncopated pocket",
    ],
  },
  {
    category: "rhythm",
    family: "Groove",
    subfamily: "Electronic & club feel",
    level: "common",
    sourceFamilies: ["beatport"],
    labels: [
      "four-on-the-floor rhythm",
      "broken-beat rhythm",
      "2-step garage rhythm",
      "Amen break",
      "rolling drum-and-bass rhythm",
      "half-time bass rhythm",
      "tribal house percussion",
      "syncopated house groove",
      "driving techno pulse",
      "hypnotic techno loop",
      "progressive-house pulse",
      "offbeat bass rhythm",
    ],
  },
  {
    category: "rhythm",
    family: "Complexity",
    subfamily: "Advanced rhythm",
    level: "advanced",
    sourceFamilies: ["music-theory", "rock-corpus"],
    labels: [
      "syncopation",
      "polyrhythm",
      "polymeter",
      "cross-rhythm",
      "hemiola",
      "metric displacement",
      "rhythmic displacement",
      "metric modulation",
      "rhythmic augmentation",
      "rhythmic diminution",
      "nested tuplets",
      "irregular phrase lengths",
      "syncopated unison riffs",
    ],
  },
  {
    category: "mood",
    family: "Wonder",
    subfamily: "Awe & mystery",
    level: "common",
    sourceFamilies: ["gems", "editorial"],
    labels: [
      "wonder",
      "awe",
      "mysterious",
      "dreamlike",
      "ethereal",
      "otherworldly",
      "enchanted",
      "cosmic",
      "surreal",
    ],
  },
  {
    category: "mood",
    family: "Transcendence",
    subfamily: "Elevation & vastness",
    level: "common",
    sourceFamilies: ["gems", "editorial"],
    labels: [
      "transcendent",
      "majestic",
      "sublime",
      "expansive",
      "spiritual",
      "elevated",
      "weightless",
      "infinite",
    ],
  },
  {
    category: "mood",
    family: "Tenderness",
    subfamily: "Intimacy & care",
    level: "common",
    sourceFamilies: ["gems", "editorial"],
    labels: [
      "tender",
      "intimate",
      "affectionate",
      "vulnerable",
      "gentle",
      "delicate",
      "warm",
      "yearning",
    ],
  },
  {
    category: "mood",
    family: "Nostalgia",
    subfamily: "Memory & longing",
    level: "common",
    sourceFamilies: ["gems", "editorial"],
    labels: [
      "nostalgic",
      "wistful",
      "bittersweet",
      "sentimental",
      "reminiscent",
      "homesick",
      "longing",
      "reflective",
    ],
  },
  {
    category: "mood",
    family: "Peacefulness",
    subfamily: "Calm & stillness",
    level: "common",
    sourceFamilies: ["gems", "editorial"],
    labels: [
      "peaceful",
      "serene",
      "tranquil",
      "meditative",
      "soothing",
      "calm",
      "still",
      "restful",
      "hushed",
      "hypnotic",
    ],
  },
  {
    category: "mood",
    family: "Power",
    subfamily: "Strength & scale",
    level: "common",
    sourceFamilies: ["gems", "editorial"],
    labels: [
      "powerful",
      "triumphant",
      "commanding",
      "heroic",
      "imposing",
      "monumental",
      "resolute",
      "forceful",
    ],
  },
  {
    category: "mood",
    family: "Joyful activation",
    subfamily: "Positive energy",
    level: "common",
    sourceFamilies: ["gems", "editorial"],
    labels: [
      "joyful",
      "playful",
      "euphoric",
      "celebratory",
      "buoyant",
      "optimistic",
      "exuberant",
      "radiant",
      "carefree",
    ],
  },
  {
    category: "mood",
    family: "Tension",
    subfamily: "Unease & threat",
    level: "common",
    sourceFamilies: ["gems", "editorial", "artist-reference"],
    labels: [
      "tense",
      "anxious",
      "uneasy",
      "ominous",
      "foreboding",
      "claustrophobic",
      "suspenseful",
      "volatile",
      "paranoid",
      "haunting",
      "menacing",
      "nervous",
      "unsettling",
      "nocturnal",
    ],
  },
  {
    category: "mood",
    family: "Sadness",
    subfamily: "Loss & isolation",
    level: "common",
    sourceFamilies: ["gems", "editorial"],
    labels: [
      "sad",
      "melancholy",
      "mournful",
      "desolate",
      "lonely",
      "heartbroken",
      "resigned",
      "somber",
      "bleak",
      "grieving",
    ],
  },
  {
    category: "attitude",
    family: "Defiance",
    subfamily: "Rebellion",
    level: "common",
    sourceFamilies: ["rock-corpus", "artist-reference", "editorial"],
    labels: [
      "rebellious",
      "defiant",
      "irreverent",
      "confrontational",
      "provocative",
      "unapologetic",
      "anti-establishment",
      "insubordinate",
      "nonconformist",
      "combative",
    ],
  },
  {
    category: "attitude",
    family: "Swagger",
    subfamily: "Confidence & bravado",
    level: "common",
    sourceFamilies: ["rock-corpus", "editorial"],
    labels: [
      "swaggering",
      "cocky",
      "brazen",
      "brash",
      "self-assured",
      "streetwise",
      "flashy",
      "boastful",
      "strutting",
    ],
  },
  {
    category: "attitude",
    family: "Mischief",
    subfamily: "Playful antagonism",
    level: "common",
    sourceFamilies: ["artist-reference", "editorial"],
    labels: [
      "mischievous",
      "sarcastic",
      "sardonic",
      "snarky",
      "taunting",
      "playfully antagonistic",
      "cheeky",
      "impish",
      "absurdist",
      "darkly humorous",
    ],
  },
  {
    category: "attitude",
    family: "Edge",
    subfamily: "Risk & transgression",
    level: "common",
    sourceFamilies: ["rock-corpus", "artist-reference"],
    labels: [
      "edgy",
      "reckless",
      "rowdy",
      "unhinged",
      "feral",
      "abrasive",
      "dangerous",
      "transgressive",
      "volatile",
      "rude",
      "nervy",
      "manic",
    ],
  },
  {
    category: "attitude",
    family: "Detachment",
    subfamily: "Cool distance",
    level: "common",
    sourceFamilies: ["artist-reference", "editorial"],
    labels: [
      "nonchalant",
      "detached",
      "aloof",
      "world-weary",
      "deadpan",
      "coolly restrained",
      "jaded",
      "cynical",
    ],
  },
  {
    category: "energy",
    family: "Low energy",
    subfamily: "Restraint",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "restrained",
      "slow-burning",
      "simmering",
      "understated",
      "languid",
      "drifting",
      "suspended",
      "patient",
      "low-key",
    ],
  },
  {
    category: "energy",
    family: "Medium energy",
    subfamily: "Motion",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "restless",
      "driving",
      "propulsive",
      "kinetic",
      "urgent",
      "pulsing",
      "rolling",
      "steady",
      "forward-moving",
    ],
  },
  {
    category: "energy",
    family: "High energy",
    subfamily: "Impact",
    level: "common",
    sourceFamilies: ["rock-corpus", "beatport", "artist-reference"],
    labels: [
      "explosive",
      "frantic",
      "frenzied",
      "relentless",
      "high-voltage",
      "live-wire",
      "hyperactive",
      "adrenalized",
      "full-throttle",
      "breakneck",
      "raging",
      "intense",
    ],
  },
  {
    category: "energy",
    family: "Dynamic arc",
    subfamily: "Change over time",
    level: "common",
    sourceFamilies: ["editorial", "rock-corpus"],
    labels: [
      "gradually escalating",
      "crescendo-driven",
      "loud-quiet dynamic",
      "quiet-loud-quiet",
      "build-and-release",
      "tension-and-release",
      "sudden dynamic shifts",
      "slow build to climax",
    ],
  },
  {
    category: "sonic-quality",
    family: "Density",
    subfamily: "Layering",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "dense",
      "layered",
      "maximal",
      "sparse",
      "skeletal",
      "minimal",
      "cluttered",
      "open",
      "thick",
      "weighty",
      "bone-crunching",
      "colossal",
    ],
  },
  {
    category: "sonic-quality",
    family: "Space",
    subfamily: "Depth & image",
    level: "common",
    sourceFamilies: ["editorial", "artist-reference"],
    labels: [
      "spacious",
      "cavernous",
      "wide",
      "narrow",
      "intimate",
      "close",
      "distant",
      "immersive",
      "three-dimensional",
      "panoramic",
      "claustrophobic",
    ],
  },
  {
    category: "sonic-quality",
    family: "Surface",
    subfamily: "Timbre & texture",
    level: "common",
    sourceFamilies: ["rock-corpus", "editorial"],
    labels: [
      "hazy",
      "smeared",
      "crystalline",
      "grainy",
      "saturated",
      "washed-out",
      "metallic",
      "organic",
      "synthetic",
      "tactile",
      "glossy",
      "dusty",
      "velvety",
      "brittle",
      "fuzzy",
      "glassy",
      "smoky",
      "murky",
      "liquid",
      "wiry",
      "angular",
      "sludgy",
      "searing",
      "ghostly",
      "serrated",
      "breezy",
      "abrasive",
    ],
  },
  {
    category: "sonic-quality",
    family: "Polish",
    subfamily: "Finish",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "raw",
      "polished",
      "rough-edged",
      "clean",
      "lo-fi",
      "hi-fi",
      "imperfect",
      "precise",
      "controlled",
      "unvarnished",
    ],
  },
  {
    category: "sonic-quality",
    family: "Temperature",
    subfamily: "Warmth & brightness",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "warm",
      "cold",
      "dark",
      "bright",
      "muted",
      "luminous",
      "shadowy",
      "sun-bleached",
      "neon-lit",
    ],
  },
  {
    category: "theme",
    family: "Inner life",
    subfamily: "Self & emotion",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "identity",
      "self-doubt",
      "isolation",
      "loneliness",
      "longing",
      "desire",
      "heartbreak",
      "grief",
      "nostalgia",
      "memory",
      "anxiety",
      "depression",
      "hope",
      "resilience",
      "obsession",
      "possessiveness",
      "vulnerability",
      "self-destruction",
      "personal growth",
      "alienation",
    ],
  },
  {
    category: "theme",
    family: "Relationships",
    subfamily: "Interpersonal",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "romance",
      "intimacy",
      "breakup",
      "jealousy",
      "betrayal",
      "dependency",
      "conflict",
      "reconciliation",
      "friendship",
      "family",
      "distance",
      "unrequited love",
    ],
  },
  {
    category: "theme",
    family: "Society",
    subfamily: "External world",
    level: "common",
    sourceFamilies: ["rock-corpus", "editorial"],
    labels: [
      "rebellion",
      "authority",
      "social pressure",
      "consumerism",
      "technology",
      "urban life",
      "war",
      "politics",
      "class",
      "work",
      "media",
      "surveillance",
      "conformity",
      "counterculture",
    ],
  },
  {
    category: "theme",
    family: "Imagery",
    subfamily: "Time & place",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "nightlife",
      "the city at night",
      "travel",
      "home",
      "weather",
      "dreams",
      "sleep",
      "memory and time",
      "future anxiety",
      "spirituality",
      "nature",
      "the ocean",
      "desert landscapes",
      "outer space",
    ],
  },
  {
    category: "songwriting",
    family: "Song form",
    subfamily: "Popular forms",
    level: "common",
    sourceFamilies: ["music-theory", "rock-corpus"],
    labels: [
      "verse-chorus songwriting",
      "verse-refrain songwriting",
      "AABA songwriting",
      "strophic songwriting",
      "through-composed songwriting",
      "riff-driven songwriting",
      "hook-driven songwriting",
      "groove-driven songwriting",
      "melody-first songwriting",
      "rhythm-first songwriting",
    ],
  },
  {
    category: "songwriting",
    family: "Development",
    subfamily: "Motif & structure",
    level: "common",
    sourceFamilies: ["rock-corpus", "music-theory"],
    labels: [
      "motif-driven composition",
      "repetition with gradual development",
      "thematic development",
      "thematic reprise",
      "extended instrumental development",
      "multi-part suite writing",
      "episodic structure",
      "cyclical structure",
      "long-form progressive development",
      "build-and-release structure",
      "minimalist process writing",
    ],
  },
  {
    category: "songwriting",
    family: "Lyrics",
    subfamily: "Narrative & voice",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "emotionally direct songwriting",
      "lyrical introspection",
      "confessional writing",
      "narrative songwriting",
      "character-driven storytelling",
      "observational writing",
      "stream-of-consciousness lyrics",
      "fragmentary lyrics",
      "abstract lyrics",
      "social commentary",
      "dark humor",
      "conversational lyricism",
    ],
  },
  {
    category: "songwriting",
    family: "Arrangement",
    subfamily: "Ensemble writing",
    level: "advanced",
    sourceFamilies: ["rock-corpus", "artist-reference"],
    labels: [
      "contrapuntal ensemble writing",
      "interlocking parts",
      "call-and-response arrangement",
      "dynamic sectional contrast",
      "orchestral arrangement",
      "layered ensemble writing",
      "instrumental composition",
      "improvisation-led composition",
      "tight unison writing",
    ],
  },
  {
    category: "identity",
    family: "Songwriting identity",
    subfamily: "Melody & emotion",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "emotionally direct songwriting",
      "melodic songwriting",
      "lyrical introspection",
      "narrative songwriting",
      "melody over complexity",
      "hooks inside experimental arrangements",
      "vulnerability framed by strong melodies",
    ],
  },
  {
    category: "identity",
    family: "Rock identity",
    subfamily: "Guitar & band",
    level: "common",
    sourceFamilies: ["rock-corpus"],
    labels: [
      "tension between melody and distortion",
      "raw live-band immediacy",
      "dense guitar textures",
      "contrast between vulnerability and aggression",
      "riff-driven songwriting with atmospheric detail",
      "progressive complexity without losing hooks",
      "psychedelic texture anchored by songcraft",
      "punk energy inside carefully arranged songs",
    ],
  },
  {
    category: "identity",
    family: "Electronic identity",
    subfamily: "Machine & human",
    level: "common",
    sourceFamilies: ["beatport", "artist-reference"],
    labels: [
      "tension between acoustic and electronic sound",
      "mechanical rhythm with human emotion",
      "melodic electronic production",
      "extended electronic development",
      "deep grooves and atmospheric soundscapes",
      "club rhythm with introspective songwriting",
      "organic instrumentation inside electronic production",
      "synthetic texture around conventional song forms",
      "synth-heavy atmospheric songwriting",
    ],
  },
  {
    category: "identity",
    family: "Experimental identity",
    subfamily: "Texture & form",
    level: "common",
    sourceFamilies: ["editorial", "music-theory"],
    labels: [
      "texture over virtuosity",
      "atmosphere over spectacle",
      "repetition with subtle variation",
      "harmonic ambiguity as an expressive device",
      "formal experimentation grounded by melody",
      "cinematic atmosphere",
      "nocturnal tension",
      "carefully controlled contrast",
    ],
  },
  {
    category: "performance",
    family: "Live feel",
    subfamily: "Spontaneity",
    level: "common",
    sourceFamilies: ["rock-corpus", "artist-reference"],
    labels: [
      "spontaneous performance",
      "live-band performance",
      "live-off-the-floor feel",
      "live-wire performance",
      "loose ensemble feel",
      "improvisational performance",
      "visceral performance",
      "immediate performance",
      "room-energy performance",
      "communal performance",
      "reckless performance",
    ],
  },
  {
    category: "performance",
    family: "Precision",
    subfamily: "Control",
    level: "common",
    sourceFamilies: ["rock-corpus", "artist-reference"],
    labels: [
      "tight ensemble playing",
      "precision-driven performance",
      "tightly controlled performance",
      "virtuosic interplay",
      "technical instrumental performance",
      "metronomic precision",
      "locked-in rhythm section",
      "synchronized unison playing",
    ],
  },
  {
    category: "performance",
    family: "Delivery",
    subfamily: "Vocal & expressive",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "restrained delivery",
      "aggressive delivery",
      "breathy delivery",
      "whispered delivery",
      "shouted delivery",
      "deadpan delivery",
      "conversational delivery",
      "melismatic delivery",
      "spoken-word delivery",
      "theatrical delivery",
      "manic delivery",
      "intimate delivery",
    ],
  },
  {
    category: "performance",
    family: "Interaction",
    subfamily: "Ensemble roles",
    level: "advanced",
    sourceFamilies: ["rock-corpus", "music-theory"],
    labels: [
      "instrumental call and response",
      "contrapuntal interplay",
      "rhythmic unison",
      "solo-and-accompaniment contrast",
      "improvised ensemble interaction",
      "layered ensemble interaction",
      "drums-and-bass lock",
    ],
  },
  {
    category: "context",
    family: "Career stage",
    subfamily: "Release position",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "debut release",
      "early recording effort",
      "first sustained songwriting effort",
      "breakthrough release",
      "sophomore release",
      "mature-period release",
      "late-career release",
      "return after a hiatus",
      "side project",
      "solo debut",
      "collaborative release",
    ],
  },
  {
    category: "context",
    family: "Change",
    subfamily: "Evolution",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "stylistic transition",
      "creative reset",
      "expansion of an established sound",
      "return to earlier influences",
      "move toward heavier material",
      "move toward electronic production",
      "move toward live instrumentation",
      "move toward more intimate songwriting",
      "move toward more experimental structures",
      "move toward greater compositional complexity",
    ],
  },
  {
    category: "context",
    family: "Recording circumstance",
    subfamily: "Process",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "home-studio recording period",
      "live-room recording period",
      "late-night recording sessions",
      "remote collaboration",
      "self-produced release",
      "band-produced release",
      "studio experimentation period",
      "improvisation-led sessions",
      "demo-stage recordings",
      "archival recordings",
    ],
  },
  {
    category: "context",
    family: "Archive & alternate",
    subfamily: "Documentary context",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "demo collection",
      "archival release",
      "alternate versions",
      "unfinished recordings",
      "early arrangements",
      "pre-production recordings",
      "live session document",
      "rehearsal recordings",
      "previously unreleased material",
    ],
  },
  {
    category: "place",
    family: "Geography",
    subfamily: "Southern California",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "Orange County",
      "Los Angeles",
      "Southern California",
      "coastal Southern California",
    ],
  },
  {
    category: "place",
    family: "Scene",
    subfamily: "Urban & nightlife",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "club culture",
      "warehouse scene",
      "late-night city atmosphere",
      "urban nightlife",
      "underground scene",
      "DIY venue culture",
      "independent rock scene",
      "electronic club scene",
    ],
  },
  {
    category: "place",
    family: "Recording space",
    subfamily: "Studio context",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "home studio",
      "bedroom studio",
      "rehearsal room",
      "live room",
      "project studio",
      "warehouse studio",
    ],
  },
  {
    category: "place",
    family: "Imagined setting",
    subfamily: "Environmental character",
    level: "common",
    sourceFamilies: ["editorial"],
    labels: [
      "neon-lit cityscape",
      "desert landscape",
      "coastal atmosphere",
      "night-drive setting",
      "industrial landscape",
      "smoky lounge atmosphere",
      "cinematic interior space",
    ],
  },
];

const descriptorAliases: Readonly<Record<string, readonly string[]>> = {
  "attitude:defiant": ["defiance"],
  "attitude:irreverent": ["irreverence"],
  "attitude:rebellious": ["rebel", "rebelliousness"],
  "genre:2-Step": ["2 step", "two-step", "two step garage"],
  "genre:Deep Drum & Bass": ["deep D&B", "deep DnB"],
  "genre:Drum & Bass": ["D&B", "DnB", "drum and bass"],
  "genre:Electropunk": ["electro-punk"],
  "genre:Hard Dance / Hardcore / Neo Rave": ["hard dance", "neo rave"],
  "genre:Liquid Drum & Bass": ["liquid D&B", "liquid DnB"],
  "genre:Melodic House & Techno": ["melodic house and techno"],
  "genre:Neo-Psychedelia": ["neo-psych", "neo psychedelic rock"],
  "genre:Nu Disco": ["nu-disco"],
  "genre:Progressive Metal": ["prog metal"],
  "genre:Progressive Rock": ["prog rock", "prog"],
  "genre:Psy-Trance": ["psytrance"],
  "genre:Techno (Peak Time / Driving)": ["peak-time techno", "driving techno"],
  "genre:Techno (Raw / Deep / Hypnotic)": ["raw/deep/hypnotic techno"],
  "genre:Trance (Main Floor)": ["main-floor trance"],
  "genre:Trance (Raw / Deep / Hypnotic)": ["raw/deep/hypnotic trance"],
  "genre:Trap / Future Bass": ["trap and future bass"],
  "genre:Trip-Hop": ["trip hop"],
  "genre:UK Garage": ["UKG"],
  "genre:UK Garage / Bassline": ["UKG / bassline"],
  "mood:euphoric": ["euphoria"],
  "mood:melancholy": ["melancholic"],
  "performance:live-off-the-floor feel": ["live off the floor"],
  "production:FM synthesis": ["frequency modulation synthesis"],
  "production:Reese bass design": ["Reese bass"],
  "production:granular synthesis": ["granular processing"],
  "production:mid-side processing": ["M/S processing", "mid/side processing"],
  "production:sidechain compression": ["side-chain compression"],
  "rhythm:metric modulation": ["tempo modulation"],
  "sonic-quality:hi-fi": ["hi fi", "high fidelity"],
  "sonic-quality:lo-fi": ["lo fi", "low fidelity"],
  "theory:Aeolian mode": ["Aeolian", "natural minor mode"],
  "theory:Dorian mode": ["Dorian"],
  "theory:Ionian mode": ["Ionian", "major mode"],
  "theory:Locrian mode": ["Locrian"],
  "theory:Lydian mode": ["Lydian"],
  "theory:Mixolydian mode": ["Mixolydian"],
  "theory:Phrygian mode": ["Phrygian"],
  "theory:altered scale": ["diminished-whole tone scale"],
  "theory:borrowed chords": ["mode mixture"],
  "theory:modal mixture": ["mode mixture"],
  "theory:octatonic half-whole scale": ["half-whole diminished scale", "diminished scale"],
  "theory:octatonic whole-half scale": ["whole-half diminished scale", "diminished scale"],
};

const descriptorSearchTerms: Readonly<Record<string, readonly string[]>> = {
  "attitude:mischievous": ["playful", "troublemaking", "cheeky", "attitude"],
  "attitude:rebellious": ["attitude", "punk", "anti-authority", "anti-establishment", "edgy"],
  "attitude:unhinged": ["manic", "wild", "chaotic", "over-the-top"],
  "genre:Progressive House": ["extended build", "deep groove", "atmospheric"],
  "genre:Progressive Metal": ["odd meter", "syncopated prog", "virtuosic", "complex"],
  "genre:Progressive Rock": ["odd meter", "suites", "Mellotron", "complex"],
  "genre:Shoegaze": ["guitar effects", "wall of sound", "dreamy", "feedback"],
  "genre:Trip-Hop": ["Bristol", "downtempo", "breakbeats", "noir"],
  "mood:nocturnal": ["night", "nighttime", "after dark"],
  "production:dub delay": ["echo", "reggae", "space"],
  "production:reverse reverb": ["shoegaze", "dream pop"],
  "sonic-quality:hazy": ["shoegaze", "dreamy", "blurred"],
  "theory:metric modulation": ["progressive", "complex rhythm", "tempo relationship"],
  "theory:modal mixture": ["borrowed harmony", "parallel minor", "chromatic harmony"],
  "theory:quartal harmony": ["fourths", "non-tertian harmony"],
};

const descriptorRelatedKeys: Readonly<Record<string, readonly string[]>> = {
  "attitude:defiant": ["attitude:rebellious", "attitude:confrontational", "attitude:unapologetic"],
  "attitude:rebellious": ["attitude:defiant", "attitude:irreverent", "attitude:provocative", "attitude:unapologetic", "energy:live-wire"],
  "genre:Dub Techno": ["production:dub delay", "sonic-quality:spacious", "mood:hypnotic", "element:sustained drones"],
  "genre:Electropunk": ["attitude:rebellious", "energy:hyperactive", "element:IDM-derived beats", "sonic-quality:abrasive"],
  "genre:Melodic Techno": ["rhythm:driving techno pulse", "element:synthesizer arpeggios", "energy:build-and-release", "mood:euphoric", "mood:tense"],
  "genre:Progressive House": ["element:four-on-the-floor kick", "energy:gradually escalating", "identity:deep grooves and atmospheric soundscapes", "production:filter automation"],
  "genre:Progressive Metal": ["rhythm:odd meter", "rhythm:syncopated unison riffs", "performance:virtuosic interplay", "songwriting:long-form progressive development", "sonic-quality:dense"],
  "genre:Progressive Rock": ["rhythm:odd meter", "rhythm:metric modulation", "songwriting:multi-part suite writing", "songwriting:thematic reprise", "performance:virtuosic interplay", "instrumentation:Mellotron"],
  "genre:Psychedelic Rock": ["element:sustained guitar drones", "element:reversed textures", "production:tape delay", "mood:surreal"],
  "genre:Shoegaze": ["element:wall-of-guitars texture", "element:feedback-drenched guitars", "production:reverse reverb", "sonic-quality:hazy", "mood:dreamlike"],
  "genre:Trip-Hop": ["element:slow breakbeats", "production:dub delay", "element:hypnotic samples", "influence:film noir", "mood:nocturnal", "sonic-quality:smoky"],
  "influence:spy soundtracks": ["mood:mysterious", "sonic-quality:smoky", "identity:cinematic atmosphere"],
  "mood:melancholy": ["mood:wistful", "mood:bittersweet", "mood:somber", "mood:lonely"],
  "mood:tense": ["mood:anxious", "mood:uneasy", "mood:foreboding", "energy:restless"],
  "performance:spontaneous performance": ["performance:live-band performance", "performance:improvisational performance", "energy:live-wire", "sonic-quality:raw"],
  "production:live-room recording": ["production:room bleed", "performance:live-off-the-floor feel", "sonic-quality:raw"],
  "rhythm:metric modulation": ["rhythm:polyrhythm", "rhythm:polymeter", "rhythm:changing meter"],
  "theory:modal mixture": ["theory:borrowed chords", "theory:chromatic harmony"],
  "theory:quartal harmony": ["theory:quintal harmony", "theory:secundal harmony", "theory:non-functional harmony"],
};

function slugDescriptorPart(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeDescriptorId(
  category: ReleaseDescriptorCategoryId,
  family: string,
  subfamily: string,
  label: string,
): string {
  return [
    category,
    slugDescriptorPart(family),
    slugDescriptorPart(subfamily),
    slugDescriptorPart(label),
  ].join(".");
}

function descriptorKey(
  category: ReleaseDescriptorCategoryId,
  label: string,
): string {
  return `${category}:${label}`;
}

const descriptorIdByKey = new Map<string, string>();

for (const group of releaseDescriptorGroups) {
  for (const label of group.labels) {
    const key = descriptorKey(
      group.category,
      label,
    );

    if (!descriptorIdByKey.has(key)) {
      descriptorIdByKey.set(
        key,
        makeDescriptorId(
          group.category,
          group.family,
          group.subfamily,
          label,
        ),
      );
    }
  }
}

/**
 * Normalized Release Profile vocabulary.
 *
 * This module is intentionally independent from the current M1 flat-select
 * profile UI. M2 will use this ontology for canonical persistence and the
 * hierarchical Descriptor Browser. Keeping it separate now avoids making the
 * temporary dropdowns even longer while the taxonomy is being normalized.
 *
 * Descriptor IDs are deterministic and are treated as canonical once M2
 * persistence begins. After that point, change labels through aliases/migration
 * rather than silently changing IDs.
 */
export const releaseDescriptorOntology:
  readonly ReleaseDescriptor[] = (() => {
    const descriptors: ReleaseDescriptor[] = [];
    const seenKeys = new Set<string>();

    for (const group of releaseDescriptorGroups) {
      for (const label of group.labels) {
        const key = descriptorKey(
          group.category,
          label,
        );

        if (seenKeys.has(key)) {
          continue;
        }

        seenKeys.add(key);

        const related = (
          descriptorRelatedKeys[key] ?? []
        )
          .map(
            (relatedKey) =>
              descriptorIdByKey.get(relatedKey),
          )
          .filter(
            (
              relatedId,
            ): relatedId is string =>
              Boolean(relatedId),
          );

        const aliases =
          descriptorAliases[key] ?? [];
        const searchTerms =
          descriptorSearchTerms[key] ?? [];

        descriptors.push({
          id: descriptorIdByKey.get(key)!,
          label,
          category: group.category,
          family: group.family,
          subfamily: group.subfamily,
          level: group.level,
          sourceFamilies:
            group.sourceFamilies,
          ...(aliases.length > 0
            ? { aliases }
            : {}),
          ...(searchTerms.length > 0
            ? { searchTerms }
            : {}),
          ...(related.length > 0
            ? { related }
            : {}),
        });
      }
    }

    return descriptors;
  })();

const descriptorById = new Map(
  releaseDescriptorOntology.map((descriptor) => [
    descriptor.id,
    descriptor,
  ]),
);

export function getReleaseDescriptor(
  id: string,
): ReleaseDescriptor | undefined {
  return descriptorById.get(id);
}

export function getReleaseDescriptorsByCategory(
  category: ReleaseDescriptorCategoryId,
): ReleaseDescriptor[] {
  return releaseDescriptorOntology.filter(
    (descriptor) =>
      descriptor.category === category,
  );
}

export function getReleaseDescriptorFamilies(
  category: ReleaseDescriptorCategoryId,
): string[] {
  return [
    ...new Set(
      getReleaseDescriptorsByCategory(category).map(
        (descriptor) => descriptor.family,
      ),
    ),
  ];
}

export function getReleaseDescriptorSubfamilies(
  category: ReleaseDescriptorCategoryId,
  family: string,
): string[] {
  return [
    ...new Set(
      getReleaseDescriptorsByCategory(category)
        .filter(
          (descriptor) =>
            descriptor.family === family,
        )
        .map(
          (descriptor) =>
            descriptor.subfamily,
        ),
    ),
  ];
}

export function getRelatedReleaseDescriptors(
  id: string,
): ReleaseDescriptor[] {
  const descriptor =
    descriptorById.get(id);

  if (!descriptor?.related) {
    return [];
  }

  return descriptor.related
    .map(
      (relatedId) =>
        descriptorById.get(relatedId),
    )
    .filter(
      (
        related,
      ): related is ReleaseDescriptor =>
        Boolean(related),
    );
}

export function searchReleaseDescriptors(
  query: string,
  options: {
    category?: ReleaseDescriptorCategoryId;
    level?: ReleaseDescriptorLevel;
    limit?: number;
  } = {},
): ReleaseDescriptor[] {
  const normalizedQuery = query
    .trim()
    .toLocaleLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const terms = normalizedQuery
    .split(/\s+/)
    .filter(Boolean);

  const score = (
    descriptor: ReleaseDescriptor,
  ): number => {
    const label =
      descriptor.label.toLocaleLowerCase();
    const aliases = (
      descriptor.aliases ?? []
    ).map((alias) =>
      alias.toLocaleLowerCase(),
    );

    if (label === normalizedQuery) {
      return 100;
    }

    if (
      aliases.includes(normalizedQuery)
    ) {
      return 95;
    }

    if (
      label.startsWith(normalizedQuery)
    ) {
      return 80;
    }

    if (
      aliases.some((alias) =>
        alias.startsWith(
          normalizedQuery,
        ),
      )
    ) {
      return 75;
    }

    return 50;
  };

  return releaseDescriptorOntology
    .filter((descriptor) => {
      if (
        options.category &&
        descriptor.category !==
          options.category
      ) {
        return false;
      }

      if (
        options.level &&
        descriptor.level !== options.level
      ) {
        return false;
      }

      const haystack = [
        descriptor.label,
        descriptor.category,
        descriptor.family,
        descriptor.subfamily,
        ...(descriptor.aliases ?? []),
        ...(descriptor.searchTerms ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase();

      return terms.every(
        (term) =>
          haystack.includes(term),
      );
    })
    .sort((left, right) => {
      const scoreDifference =
        score(right) - score(left);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.label.localeCompare(
        right.label,
      );
    })
    .slice(0, options.limit ?? 50);
}

export function getReleaseDescriptorOntologyStats(): {
  total: number;
  common: number;
  advanced: number;
  byCategory: Record<
    ReleaseDescriptorCategoryId,
    number
  >;
} {
  const byCategory =
    Object.fromEntries(
      releaseDescriptorCategoryDefinitions.map(
        (category) => [
          category.id,
          0,
        ],
      ),
    ) as Record<
      ReleaseDescriptorCategoryId,
      number
    >;

  let common = 0;
  let advanced = 0;

  for (
    const descriptor of releaseDescriptorOntology
  ) {
    byCategory[descriptor.category] += 1;

    if (
      descriptor.level === "advanced"
    ) {
      advanced += 1;
    } else {
      common += 1;
    }
  }

  return {
    total:
      releaseDescriptorOntology.length,
    common,
    advanced,
    byCategory,
  };
}
