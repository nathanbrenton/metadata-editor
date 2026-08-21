import {
  releaseDescriptorOntology,
  type ReleaseDescriptor,
} from "./release-descriptor-ontology.js";

export type EditorialGenreKnowledge = {
  origin: string;
  description: string;
  sounds: readonly string[];
};

type GenreLineage = {
  period: string;
  places: string;
  description: string;
  sounds: readonly string[];
};

function normalizeDescriptorLabel(
  value: string,
): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

const moodDefinitions: Readonly<Record<string, string>> =
{
  "wonder": "A feeling of fascinated surprise and curiosity in response to something remarkable, unfamiliar, or larger than expected.",
  "awe": "A powerful feeling of wonder mixed with respect, vastness, or even a trace of fear.",
  "mysterious": "Suggesting something unknown, hidden, difficult to explain, or not fully revealed.",
  "dreamlike": "Resembling a dream through softened logic, floating imagery, altered perspective, or unreal atmosphere.",
  "ethereal": "Extremely delicate, light, airy, or seemingly removed from ordinary physical weight.",
  "otherworldly": "Strange, uncanny, or beautiful in a way that feels removed from ordinary physical reality.",
  "enchanted": "Filled with a sense of magic, fascination, wonder, or being under a spell.",
  "cosmic": "Suggesting immense space, celestial scale, or a perspective larger than everyday human experience.",
  "surreal": "Dreamlike or uncanny because familiar things are combined, distorted, or presented in an improbable way.",
  "transcendent": "Seeming to rise beyond ordinary limits, experience, or material concerns.",
  "majestic": "Impressively grand, dignified, or imposing in scale and character.",
  "sublime": "Producing profound awe, beauty, or grandeur that feels beyond ordinary experience.",
  "expansive": "Broad, open, spacious, or growing outward in emotional or perceived scale.",
  "spiritual": "Concerned with inner meaning, transcendence, sacred feeling, or experiences beyond the purely material.",
  "elevated": "Raised in emotional tone, dignity, intensity, or sense of significance.",
  "weightless": "Floating, suspended, or free of heaviness, gravity, and grounded physical pressure.",
  "infinite": "Suggesting boundlessness, endless continuation, or scale without a clear limit.",
  "tender": "Gentle, caring, affectionate, or emotionally sensitive rather than hard or forceful.",
  "intimate": "Close, personal, private, or emotionally exposed, as though experienced at very short distance.",
  "affectionate": "Showing warmth, fondness, attachment, or caring feeling toward someone or something.",
  "vulnerable": "Open to hurt, exposure, uncertainty, or emotional risk, often because defenses are lowered.",
  "gentle": "Mild, soft, considerate, and free from harshness or force.",
  "delicate": "Fine, fragile, subtle, or easily disturbed rather than heavy or forceful.",
  "warm": "Suggesting comfort, closeness, friendliness, or a rounded and inviting character.",
  "yearning": "Marked by a deep, persistent desire for something distant, absent, difficult, or unattained.",
  "nostalgic": "Marked by affectionate or wistful longing for a past time, place, person, or experience.",
  "wistful": "Quietly longing or regretful, often with a gentle awareness that something desired is absent or past.",
  "bittersweet": "Combining pleasure, affection, or beauty with sadness, regret, pain, or loss.",
  "sentimental": "Strongly shaped by tender, nostalgic, or emotionally attached feeling, sometimes more than detached judgment.",
  "reminiscent": "Evoking or calling to mind an earlier time, person, place, sound, or experience.",
  "homesick": "Longing for home, familiar surroundings, or the people and routines associated with them.",
  "longing": "A strong, persistent desire for someone, something, or a condition that is absent or difficult to reach.",
  "reflective": "Thoughtful and inward-looking, especially in considering memory, meaning, choices, or experience.",
  "peaceful": "Calm, settled, and largely free from conflict, agitation, urgency, or threat.",
  "serene": "Calm, clear, and untroubled, with a composed sense of stillness.",
  "tranquil": "Quiet and peaceful, with little disturbance, tension, or agitation.",
  "meditative": "Contemplative and inwardly focused, encouraging sustained attention or reflection.",
  "soothing": "Calming or comforting in a way that reduces tension, agitation, or distress.",
  "calm": "Free from strong agitation, excitement, disturbance, or emotional turbulence.",
  "still": "Marked by quiet, little motion, and a sense of suspended activity.",
  "restful": "Encouraging relaxation, ease, and recovery from effort or tension.",
  "hushed": "Quiet, subdued, and restrained, as though volume and activity have been deliberately lowered.",
  "hypnotic": "Holding attention through repetition, focus, or gradual variation in a way that can feel trance-like.",
  "powerful": "Communicating strength, force, scale, authority, or unusually strong emotional impact.",
  "triumphant": "Expressing victory, success, conquest, or the feeling of overcoming resistance.",
  "commanding": "Projecting authority, control, confidence, or an ability to dominate attention.",
  "heroic": "Suggesting courage, bold action, endurance, sacrifice, or larger-than-life resolve.",
  "imposing": "Impressive or intimidating because of size, force, presence, or authority.",
  "monumental": "Very large in perceived scale, weight, importance, or structural ambition.",
  "resolute": "Firmly determined, steady, and unwilling to be diverted by difficulty or opposition.",
  "forceful": "Strong, direct, and energetic in impact or expression.",
  "joyful": "Expressing or producing strong happiness, delight, or gladness.",
  "playful": "Light, curious, teasing, mischievous, or game-like rather than solemn or severe.",
  "euphoric": "Marked by an intense rush of happiness, excitement, uplift, or emotional release.",
  "celebratory": "Expressing enjoyment, recognition, or shared excitement around success, occasion, or achievement.",
  "buoyant": "Cheerful, lively, and able to rise above heaviness, discouragement, or emotional weight.",
  "optimistic": "Marked by positive expectation, confidence, or hope that events can turn out well.",
  "exuberant": "Overflowing with energetic enthusiasm, excitement, liveliness, or joy.",
  "radiant": "Bright, glowing, and outwardly expressive of warmth, happiness, or vitality.",
  "carefree": "Free from worry, responsibility, restraint, or serious concern.",
  "tense": "Marked by strain, pressure, suspense, or readiness for conflict or sudden change.",
  "anxious": "Marked by worry, unease, nervousness, or apprehension about what may happen.",
  "uneasy": "Uncomfortable, uncertain, worried, or unable to fully relax.",
  "ominous": "Suggesting that something threatening, harmful, or unpleasant may be approaching.",
  "foreboding": "Creating a strong sense that trouble, danger, or misfortune is likely to come.",
  "claustrophobic": "Conveying confinement, pressure, restricted space, or a feeling that there is too little room to escape.",
  "suspenseful": "Sustaining uncertain anticipation about what will happen next, especially when risk or consequence feels present.",
  "volatile": "Prone to sudden shifts, instability, escalation, or explosive change.",
  "paranoid": "Marked by suspicion, hypervigilance, or fear that an unseen threat or hostile intention is present.",
  "haunting": "Emotionally persistent, eerie, or difficult to forget, often combining beauty with unease or loss.",
  "menacing": "Suggesting danger, hostility, intimidation, or the possibility of harm.",
  "nervous": "Restless, apprehensive, jittery, or uncertain because of anticipated risk or pressure.",
  "unsettling": "Causing discomfort or unease by making the familiar feel unstable, strange, or unsafe.",
  "nocturnal": "Evocative of nighttime through darkness, solitude, intimacy, urban atmosphere, or reduced visual and emotional brightness.",
  "sad": "Marked by unhappiness, sorrow, disappointment, or emotional pain.",
  "melancholy": "A thoughtful, lingering sadness often mixed with beauty, memory, longing, or emotional restraint.",
  "mournful": "Expressing grief, sorrow, lament, or the emotional weight of loss.",
  "desolate": "Empty, abandoned, lonely, or deprived of comfort, companionship, or hope.",
  "lonely": "Marked by isolation, lack of companionship, or painful emotional distance from others.",
  "heartbroken": "Overwhelmed by grief or emotional pain, especially after loss, rejection, or the end of a close relationship.",
  "resigned": "Accepting an unwanted outcome, limitation, or loss after resistance or hope has diminished.",
  "somber": "Serious, dark, subdued, and often touched by sadness or gravity.",
  "bleak": "Cold, barren, grim, or lacking warmth, comfort, and hope.",
  "grieving": "Experiencing or expressing sorrow in response to death, separation, loss, or major change."
};

const themeDefinitions: Readonly<Record<string, string>> =
{
  "identity": "The sense of who a person or group is, including self-concept, roles, values, belonging, and how that self is understood by others.",
  "self-doubt": "Uncertainty about one's own abilities, judgment, worth, decisions, or right to trust oneself.",
  "isolation": "Separation from other people or communities, whether physical, social, emotional, or psychological.",
  "loneliness": "The painful feeling of lacking desired connection, companionship, understanding, or belonging.",
  "longing": "A strong, persistent desire for someone, something, or a condition that is absent or difficult to reach.",
  "desire": "A strong wish, attraction, appetite, or impulse directed toward a person, experience, object, or outcome.",
  "heartbreak": "Severe emotional pain caused by loss, rejection, separation, or the failure of an important relationship or hope.",
  "grief": "Deep sorrow and emotional adjustment following death, separation, loss, or another significant ending.",
  "nostalgia": "Affectionate or wistful longing for a past time, place, person, culture, or experience.",
  "memory": "The preservation, recall, distortion, or emotional meaning of past experiences.",
  "anxiety": "Worry, apprehension, or nervous unease about possible danger, uncertainty, or what may happen next.",
  "depression": "A theme of persistent sadness, emptiness, hopelessness, withdrawal, or diminished interest and vitality.",
  "hope": "Expectation or desire that a positive outcome remains possible despite uncertainty or difficulty.",
  "resilience": "The capacity to endure, recover, adapt, or continue after stress, loss, failure, or adversity.",
  "obsession": "A persistent and consuming preoccupation with a person, idea, desire, fear, or activity.",
  "possessiveness": "A desire to control, keep, or claim a person or thing, often accompanied by jealousy or fear of loss.",
  "vulnerability": "Exposure to emotional hurt, uncertainty, dependence, or risk, especially when defenses are lowered.",
  "self-destruction": "Behavior, choices, or impulses that damage one's own wellbeing, relationships, stability, or future.",
  "personal growth": "Change through learning, self-understanding, maturity, recovery, discipline, or expanded capacity.",
  "alienation": "Estrangement or disconnection from oneself, other people, a community, culture, work, or society.",
  "romance": "Love, attraction, courtship, intimacy, or the emotional idealization of a close relationship.",
  "intimacy": "Emotional or physical closeness built through trust, openness, familiarity, and mutual access to private experience.",
  "breakup": "The ending of a romantic or intimate relationship and the emotional consequences that follow.",
  "jealousy": "Fear, resentment, or insecurity about losing affection, attention, status, or something valued to a rival.",
  "betrayal": "A violation of trust, loyalty, confidence, commitment, or an expected moral bond.",
  "dependency": "Reliance on another person, substance, system, or condition for support, functioning, security, or identity.",
  "conflict": "Opposition or struggle between people, desires, beliefs, duties, groups, or competing forces.",
  "reconciliation": "The restoration of a relationship, agreement, or peace after conflict, separation, or estrangement.",
  "friendship": "A voluntary bond of affection, trust, loyalty, companionship, or mutual support between people.",
  "family": "Kinship, household, inheritance, obligation, belonging, conflict, and the relationships formed through family ties.",
  "distance": "Physical, emotional, social, or temporal separation between people, places, memories, or desired states.",
  "unrequited love": "Love or romantic desire that is not returned, recognized, or available in the same way.",
  "rebellion": "Resistance or open opposition to authority, control, convention, rules, or an established order.",
  "authority": "Power or recognized right to direct, command, decide, influence behavior, or enforce rules.",
  "social pressure": "Influence from a group, culture, institution, or expectation that pushes someone toward particular behavior or beliefs.",
  "consumerism": "A focus on acquiring, using, displaying, or organizing life around commercial goods and consumption.",
  "technology": "Tools, machines, systems, and technical change, including their effects on identity, labor, relationships, power, and daily life.",
  "urban life": "The experience of cities: density, movement, anonymity, nightlife, architecture, work, transit, culture, and social friction.",
  "war": "Organized armed conflict and its consequences, including violence, fear, duty, loss, displacement, and political power.",
  "politics": "Power, governance, public decision-making, ideology, institutions, collective conflict, and the distribution of resources or rights.",
  "class": "Social and economic rank, status, labor, wealth, privilege, mobility, and inequality between groups.",
  "work": "Labor, occupation, effort, routine, ambition, exploitation, purpose, livelihood, and the relationship between a person and what they do.",
  "media": "Systems of communication and representation, including how stories, images, information, publicity, and attention shape perception.",
  "surveillance": "Observation, tracking, recording, or monitoring of people, behavior, communication, or environments, especially where power and privacy are involved.",
  "conformity": "Behavior or belief brought into agreement with prevailing standards, customs, expectations, or authority.",
  "counterculture": "A cultural movement or community whose values, practices, or aesthetics deliberately oppose dominant social norms.",
  "nightlife": "Social and cultural activity associated with nighttime, especially clubs, bars, performance spaces, streets, and after-dark communities.",
  "the city at night": "Urban space experienced after dark through lights, emptiness, crowds, transit, danger, anonymity, intimacy, and nocturnal atmosphere.",
  "travel": "Movement between places and the experiences of departure, transit, discovery, displacement, return, or changing perspective.",
  "home": "A place or idea associated with belonging, shelter, familiarity, origin, comfort, memory, or complicated attachment.",
  "weather": "Atmospheric conditions used literally or symbolically, including rain, heat, cold, storms, wind, fog, and seasonal change.",
  "dreams": "Dreaming, subconscious imagery, fantasy, altered logic, aspiration, or experiences that blur waking reality.",
  "sleep": "Rest, unconsciousness, insomnia, fatigue, dreaming, escape, vulnerability, or transitions between waking and sleep.",
  "memory and time": "The relationship between recollection and the passage of time, including change, aging, repetition, loss, and unreliable remembrance.",
  "future anxiety": "Worry or apprehension about what is coming, especially uncertainty, instability, technological change, loss, or feared consequences.",
  "spirituality": "Questions of inner meaning, transcendence, sacred experience, belief, connection, ritual, or realities beyond the material.",
  "nature": "The nonhuman physical world, landscapes, living systems, seasons, wilderness, and humanity's relationship to them.",
  "the ocean": "The sea as setting or symbol: depth, distance, movement, danger, calm, isolation, travel, or vastness.",
  "desert landscapes": "Deserts as setting or symbol: heat, exposure, emptiness, distance, survival, silence, and open space.",
  "outer space": "Space, planets, stars, cosmic distance, exploration, isolation, futurism, or the scale of the universe."
};

const sharedDuplicateDefinitions: Readonly<Record<string, string>> =
{
  "abrasive": "Harsh, rough, cutting, or confrontational in texture, tone, or expressive attitude.",
  "claustrophobic": "Conveying confinement, pressure, restricted space, or a feeling that there is too little room to escape.",
  "emotionally direct songwriting": "Songwriting that states or embodies feeling plainly and immediately rather than hiding it behind elaborate abstraction.",
  "found sound": "Recorded real-world sound used as musical material, such as environmental noise, machinery, speech, room tone, or incidental events.",
  "hammond organ": "The electromechanical Hammond organ, known for sustained tone, drawbar-controlled timbre and, often, rotating-speaker coloration.",
  "intimate": "Close, personal, private, or emotionally exposed, as though experienced at very short distance.",
  "longing": "A strong, persistent desire for someone, something, or a condition that is absent or difficult to reach.",
  "lyrical introspection": "Lyrics focused on inward examination of thought, feeling, memory, motive, doubt, or self-understanding.",
  "motivic development": "The transformation and reuse of a short musical idea through repetition, variation, transposition, fragmentation, inversion, or related techniques.",
  "motorik pulse": "A steady, driving beat associated with Krautrock, commonly in 4/4 with an even kick-and-snare feel and little swing.",
  "narrative songwriting": "Songwriting organized around characters, events, perspective, or a developing story rather than purely abstract or impressionistic expression.",
  "sampled dialogue": "Spoken words taken from an existing recording and incorporated as rhythmic, narrative, atmospheric, or structural material.",
  "thematic reprise": "The return of an earlier musical theme, motif, lyric, or section later in a piece or release to create continuity or transformation.",
  "through-composed form": "A form that continues developing new musical material rather than relying primarily on repeated verse, chorus, or strophic sections.",
  "volatile": "Prone to sudden shifts, instability, escalation, or explosive change.",
  "warm": "Suggesting comfort, closeness, friendliness, or a rounded and inviting character."
};

const sharedLexicalDefinitions: Readonly<Record<string, string>> = {
  ...moodDefinitions,
  ...themeDefinitions,
  ...sharedDuplicateDefinitions,
};

const genreLineages: Readonly<Record<string, GenreLineage>> =
{
  "Electronic|House": {
    "period": "late 1970s–early 1980s",
    "places": "Chicago, USA; later New York and London club scenes",
    "description": "House grew from post-disco club culture around a steady four-on-the-floor pulse, deeper bass grooves, repetitive arrangement, and increasingly electronic production.",
    "sounds": [
      "four-on-the-floor kick",
      "drum machines",
      "bass grooves",
      "synthesizers",
      "disco/funk-derived samples or harmony"
    ]
  },
  "Electronic|Techno": {
    "period": "mid-1980s",
    "places": "Detroit, USA",
    "description": "Techno developed as machine-centered dance music emphasizing synthesized rhythm, sequenced patterns, repetition, futurist texture, and electronic sound design.",
    "sounds": [
      "drum machines",
      "sequencers",
      "synthesizers",
      "electronic bass",
      "repetitive machine rhythms"
    ]
  },
  "Electronic|Trance & Psy": {
    "period": "early 1990s",
    "places": "Germany, Belgium, Goa and wider European rave scenes",
    "description": "Trance and psychedelic trance lineages emphasize repetition, sustained build-and-release, arpeggiated or sequenced synth figures, and immersive club-scale atmosphere.",
    "sounds": [
      "four-on-the-floor kick",
      "arpeggiated synthesizers",
      "sequenced bass",
      "long builds",
      "atmospheric pads"
    ]
  },
  "Electronic|Breaks, garage & bass": {
    "period": "early–mid 1990s",
    "places": "United Kingdom, especially London; with later regional scenes in the United States",
    "description": "Breakbeat, garage, jungle, drum-and-bass and bass-music lineages foreground syncopated drums, chopped breaks, sub-bass, rhythmic swing, and sound-system influence.",
    "sounds": [
      "breakbeats",
      "sub-bass",
      "sampled drums",
      "syncopated percussion",
      "chopped or processed vocals"
    ]
  },
  "Electronic|Disco, dance & club": {
    "period": "1970s onward",
    "places": "New York, Chicago, Europe and later global club scenes",
    "description": "This club lineage connects disco's dance-floor pulse to later electronic and regional dance styles built for DJs, communal movement, repetition, and physical low end.",
    "sounds": [
      "steady dance pulse",
      "basslines",
      "drum machines or percussion",
      "synthesizers",
      "sampled or repeated vocal hooks"
    ]
  },
  "Electronic|Experimental & hybrid": {
    "period": "1980s–1990s onward",
    "places": "United Kingdom, Europe and North American electronic scenes",
    "description": "Experimental and hybrid electronic styles combine club technology with listening-oriented composition, unusual rhythmic programming, sampling, ambient space, industrial texture, or cross-genre instrumentation.",
    "sounds": [
      "samplers",
      "synthesizers",
      "breakbeats",
      "processed field or found sound",
      "unconventional digital effects"
    ]
  },
  "Rock|Alternative & indie": {
    "period": "late 1970s–1980s",
    "places": "United States and United Kingdom independent, post-punk and college-radio scenes",
    "description": "Alternative and indie rock grew outside mainstream rock institutions, retaining guitar-based songwriting while absorbing punk, post-punk, noise, pop, electronic and experimental approaches.",
    "sounds": [
      "electric guitars",
      "bass",
      "drums",
      "vocals",
      "effects pedals or synthesizers depending on substyle"
    ]
  },
  "Rock|Progressive & mathematical": {
    "period": "late 1960s onward",
    "places": "United Kingdom and Europe; later strong United States scenes",
    "description": "Progressive and mathematically oriented rock expands conventional song form through extended structures, thematic development, technical ensemble writing, unusual meter, repetition, or long-form texture.",
    "sounds": [
      "electric guitar",
      "bass",
      "drums",
      "keyboards or synthesizers",
      "odd-meter or multi-section arrangements"
    ]
  },
  "Rock|Psychedelic & expansive": {
    "period": "mid-1960s onward",
    "places": "United States and United Kingdom; later global revival scenes",
    "description": "Psychedelic and expansive rock grew from 1960s studio experimentation, improvisation and altered timbre, often stretching form and blending rock with Eastern, folk, drone or heavy influences.",
    "sounds": [
      "fuzz guitar",
      "feedback",
      "sitar or drone textures",
      "studio effects",
      "extended instrumental passages"
    ]
  },
  "Rock|Punk & hard rock": {
    "period": "late 1960s–mid-1970s onward",
    "places": "United States and United Kingdom, with major local punk and metal scenes",
    "description": "Punk, hard rock and metal lineages emphasize amplified guitars, forceful rhythm sections and physical performance, ranging from concise DIY attack to heavier riff-centered forms.",
    "sounds": [
      "distorted electric guitar",
      "bass",
      "live drums",
      "forceful vocals",
      "riff-driven arrangements"
    ]
  },
  "Adjacent|Black music & songwriting": {
    "period": "20th century, with roots extending earlier",
    "places": "United States, Jamaica, Brazil and other regional traditions",
    "description": "This broad adjacent branch contains Black American, Caribbean, Brazilian and songwriting traditions whose rhythm, harmony, vocal approach, improvisation and production deeply shape modern popular music.",
    "sounds": [
      "voice",
      "rhythm section",
      "syncopation",
      "bass-centered groove",
      "acoustic or electric instrumentation specific to the tradition"
    ]
  },
  "Adjacent|Classical & cinematic": {
    "period": "Western art-music traditions through the 20th and 21st centuries",
    "places": "Europe, North America and later global concert, film and experimental scenes",
    "description": "Classical, cinematic, ambient and experimental composition lineages emphasize orchestration, formal development, timbre, atmosphere, ensemble writing, or music designed to support image and narrative.",
    "sounds": [
      "orchestral or chamber instruments",
      "piano",
      "sustained textures",
      "electronic ambience",
      "score-oriented thematic writing"
    ]
  }
};

const genreOverrides: Readonly<Record<string, EditorialGenreKnowledge>> =
{
  "house": {
    "origin": "early 1980s · Chicago, USA",
    "description": "Post-disco club music built around an insistent four-on-the-floor beat, deeper bass grooves and increasingly electronic arrangements.",
    "sounds": [
      "four-on-the-floor kick",
      "drum machines",
      "bass grooves",
      "synthesizers",
      "disco, soul, funk or dub-derived material"
    ]
  },
  "progressive house": {
    "origin": "early 1990s · United Kingdom and European club scenes",
    "description": "House shaped around gradual development, layered arrangement, evolving harmony and long-form tension-and-release rather than abrupt changes.",
    "sounds": [
      "four-on-the-floor drums",
      "layered synthesizers",
      "long builds",
      "evolving pads",
      "progressive basslines"
    ]
  },
  "tech house": {
    "origin": "1990s · primarily European club scenes",
    "description": "A house/techno hybrid combining house groove with cleaner, more minimal and techno-derived rhythm and sound design.",
    "sounds": [
      "four-on-the-floor kick",
      "minimal percussion",
      "sub-bass",
      "short synth stabs",
      "loop-based arrangement"
    ]
  },
  "deep house": {
    "origin": "mid-to-late 1980s · Chicago and New York, USA",
    "description": "A smoother house lineage emphasizing deeper bass, restrained groove, soulful or jazz-influenced harmony and a more understated club feel.",
    "sounds": [
      "deep bass",
      "soft drum-machine grooves",
      "electric-piano or synth chords",
      "soulful vocals",
      "subtle percussion"
    ]
  },
  "afro house": {
    "origin": "2000s–2010s · South African and wider African/international club scenes",
    "description": "House that foregrounds African rhythmic languages, percussion, vocals and melodic approaches within a four-on-the-floor dance framework.",
    "sounds": [
      "layered percussion",
      "four-on-the-floor kick",
      "African vocal styles",
      "deep bass",
      "organic or melodic synth textures"
    ]
  },
  "melodic house": {
    "origin": "2010s · European and international club scenes",
    "description": "House where melody, chord progression and atmospheric development are as prominent as the dance groove.",
    "sounds": [
      "melodic synthesizers",
      "warm bass",
      "four-on-the-floor drums",
      "pads",
      "arpeggios"
    ]
  },
  "bass house": {
    "origin": "2010s · international EDM and club scenes",
    "description": "House with heavier low-end design, aggressive bass timbres and drop-oriented energy derived partly from electro house and bass music.",
    "sounds": [
      "distorted bass",
      "four-on-the-floor kick",
      "wobbling or modulated synths",
      "compressed drops",
      "punchy percussion"
    ]
  },
  "future house": {
    "origin": "mid-2010s · European/international EDM scenes",
    "description": "A bright, highly produced house variant associated with elastic bass timbres, clipped synth chords and festival-ready drops.",
    "sounds": [
      "rubbery synth bass",
      "bright chord stabs",
      "four-on-the-floor kick",
      "sidechain pumping",
      "processed vocal chops"
    ]
  },
  "organic house": {
    "origin": "2010s · international downtempo and house scenes",
    "description": "A softer house style blending electronic grooves with acoustic, world, ambient and naturalistic textures.",
    "sounds": [
      "hand percussion",
      "organic instruments",
      "soft synth pads",
      "deep bass",
      "field or environmental textures"
    ]
  },
  "techno": {
    "origin": "mid-1980s · Detroit, USA",
    "description": "Machine-centered electronic dance music emphasizing synthesized beats, sequenced patterns, repetition, futurist texture and studio technology.",
    "sounds": [
      "drum machines",
      "sequencers",
      "synthesizers",
      "electronic bass",
      "repetitive machine rhythms"
    ]
  },
  "melodic techno": {
    "origin": "2010s · European and international techno scenes",
    "description": "Techno in which melodic and harmonic development take a prominent role alongside repetitive club rhythm and synthesized texture.",
    "sounds": [
      "four-on-the-floor kick",
      "arpeggiated synths",
      "minor-key chords",
      "sequenced bass",
      "long atmospheric builds"
    ]
  },
  "dub techno": {
    "origin": "early 1990s · Berlin, Germany, drawing on Detroit techno and Jamaican dub",
    "description": "Minimal techno fused with dub's spatial production, emphasizing chord stabs, delay, reverb, repetition and deep low-end atmosphere.",
    "sounds": [
      "dub chord stabs",
      "delay feedback",
      "reverb",
      "sub-bass",
      "minimal drum-machine patterns"
    ]
  },
  "hard techno": {
    "origin": "1990s · European rave and techno scenes",
    "description": "A faster, harder techno branch centered on relentless kick drums, abrasive percussion, industrial timbre and sustained physical intensity.",
    "sounds": [
      "hard four-on-the-floor kick",
      "distorted percussion",
      "industrial textures",
      "acid or synth sequences",
      "compressed low end"
    ]
  },
  "trance": {
    "origin": "early 1990s · Germany and Belgium",
    "description": "Electronic dance music built around repeated synth figures, steady four-on-the-floor rhythm, atmospheric layering and gradual build-and-release.",
    "sounds": [
      "arpeggiated synthesizers",
      "four-on-the-floor kick",
      "sequenced bass",
      "pads",
      "long breakdowns and builds"
    ]
  },
  "progressive trance": {
    "origin": "1990s · European club scenes",
    "description": "A more gradual trance style favoring evolving arrangement, deeper grooves and long-form transitions over constant peak intensity.",
    "sounds": [
      "rolling bass",
      "layered synths",
      "long transitions",
      "four-on-the-floor drums",
      "atmospheric pads"
    ]
  },
  "uplifting trance": {
    "origin": "late 1990s–2000s · European trance scenes",
    "description": "A melodic trance branch emphasizing emotional chord progressions, dramatic breakdowns and high-energy euphoric climaxes.",
    "sounds": [
      "supersaw leads",
      "arpeggios",
      "four-on-the-floor kick",
      "large breakdowns",
      "bright pads"
    ]
  },
  "psy-trance": {
    "origin": "early 1990s · Goa, India and international psychedelic-trance scenes",
    "description": "A psychedelic trance lineage built on repetitive high-energy rhythm, intricate synthetic sound design and continuously evolving timbre.",
    "sounds": [
      "rolling basslines",
      "four-on-the-floor kick",
      "acidic synth sequences",
      "psychedelic effects",
      "rapid electronic percussion"
    ]
  },
  "goa trance": {
    "origin": "late 1980s–early 1990s · Goa, India",
    "description": "An early psychedelic-trance style associated with long-form hypnotic sequencing, layered electronic motifs and a strongly psychedelic atmosphere.",
    "sounds": [
      "sequenced synth lines",
      "acid timbres",
      "four-on-the-floor kick",
      "layered arpeggios",
      "psychedelic effects"
    ]
  },
  "uk garage": {
    "origin": "mid-1990s · London, United Kingdom",
    "description": "British club music combining garage-house roots with shuffled rhythm, chopped vocals, bass-heavy production and increasing breakbeat influence.",
    "sounds": [
      "shuffled drums",
      "2-step rhythms",
      "sub-bass",
      "chopped R&B vocals",
      "syncopated percussion"
    ]
  },
  "2-step": {
    "origin": "late 1990s · London, United Kingdom",
    "description": "A UK garage rhythm that skips expected kick placements, creating a syncopated, swinging pulse with spacious low end and chopped vocal detail.",
    "sounds": [
      "skipping kick pattern",
      "shuffled hi-hats",
      "sub-bass",
      "vocal chops",
      "syncopated percussion"
    ]
  },
  "speed garage": {
    "origin": "mid-1990s · London, United Kingdom",
    "description": "An early UK garage form combining faster house tempo with heavy bass, shuffled drums, diva or ragga vocals and DJ-oriented production.",
    "sounds": [
      "shuffled house drums",
      "heavy bass",
      "vocal samples",
      "rewinds and scratches",
      "organ or synth stabs"
    ]
  },
  "drum & bass": {
    "origin": "early 1990s · United Kingdom, especially London",
    "description": "Fast breakbeat-driven electronic music built around chopped drum patterns, deep bass and highly syncopated rhythmic motion.",
    "sounds": [
      "chopped breakbeats",
      "sub-bass",
      "fast sampled drums",
      "synth pads or stabs",
      "processed vocals"
    ]
  },
  "jungle": {
    "origin": "early 1990s · United Kingdom, especially London",
    "description": "A breakbeat-heavy precursor and sibling to drum & bass combining very fast chopped drums with deep bass and strong reggae, dub and sound-system influence.",
    "sounds": [
      "Amen-style breaks",
      "deep bass",
      "ragga or reggae samples",
      "fast drum programming",
      "dub-derived effects"
    ]
  },
  "liquid drum & bass": {
    "origin": "late 1990s–early 2000s · United Kingdom",
    "description": "A smoother drum-and-bass branch emphasizing melodic harmony, atmospheric texture and soul, jazz or vocal influence over fast breaks.",
    "sounds": [
      "fast breakbeats",
      "warm sub-bass",
      "pads",
      "soulful vocals",
      "jazz-influenced chords"
    ]
  },
  "dubstep": {
    "origin": "late 1990s–early 2000s · South London, United Kingdom",
    "description": "Bass-focused UK electronic music built around sparse syncopated percussion, deep sub-bass and spacious production, commonly near a 140 BPM framework.",
    "sounds": [
      "sub-bass",
      "half-time or syncopated drums",
      "dub delay",
      "dark synth textures",
      "sparse percussion"
    ]
  },
  "grime": {
    "origin": "early 2000s · East London, United Kingdom",
    "description": "A fast, sparse UK electronic/rap style developed from garage and sound-system culture, pairing angular synthetic beats with MC-led vocal performance.",
    "sounds": [
      "square-wave or metallic synths",
      "140 BPM rhythms",
      "sub-bass",
      "sparse drums",
      "MC vocals"
    ]
  },
  "juke / footwork": {
    "origin": "1990s–2000s · Chicago, USA",
    "description": "Chicago dance music built on very fast, chopped rhythmic loops, syncopated drum programming and repetitive vocal fragments designed for footwork dance battles.",
    "sounds": [
      "rapid drum-machine patterns",
      "vocal chops",
      "sub-bass",
      "syncopated samples",
      "stuttering loops"
    ]
  },
  "jersey club": {
    "origin": "early 2000s · Newark, New Jersey, USA",
    "description": "A high-energy club style derived from Baltimore club, marked by chopped samples, kick-pattern bounce and highly repetitive dance-floor edits.",
    "sounds": [
      "bed-squeak style samples",
      "chopped vocals",
      "triplet or bouncing kick patterns",
      "short loops",
      "sub-bass"
    ]
  },
  "amapiano": {
    "origin": "early 2010s · Gauteng, South Africa",
    "description": "South African dance music blending house-derived groove with jazz, lounge and township influences, especially recognizable through deep log-drum bass patterns.",
    "sounds": [
      "log drum",
      "piano or keyboard chords",
      "shakers and percussion",
      "deep bass",
      "vocal or jazz-influenced melodies"
    ]
  },
  "gqom": {
    "origin": "early 2010s · Durban, South Africa",
    "description": "A dark, stripped South African club style built on broken or minimal rhythmic loops, heavy low end and stark, hypnotic repetition.",
    "sounds": [
      "heavy kick patterns",
      "sparse percussion",
      "dark synths",
      "sub-bass",
      "repetitive vocal or rhythmic loops"
    ]
  },
  "moombahton": {
    "origin": "2009 · Washington, D.C., USA",
    "description": "A hybrid created by slowing electro-house tempo toward reggaeton, combining dembow-derived rhythm with electronic club synths and bass.",
    "sounds": [
      "dembow-influenced drums",
      "electro-house synths",
      "heavy bass",
      "syncopated percussion",
      "vocal samples"
    ]
  },
  "idm": {
    "origin": "early 1990s · United Kingdom and European electronic scenes",
    "description": "Listening-oriented electronic music associated with intricate programming, unusual rhythm, experimental synthesis and structures less constrained by the dance floor.",
    "sounds": [
      "complex programmed drums",
      "synthesizers",
      "glitch or digital processing",
      "unusual meters or subdivisions",
      "abstract samples"
    ]
  },
  "trip-hop": {
    "origin": "early 1990s · Bristol, United Kingdom",
    "description": "Downtempo electronic music combining hip-hop-derived breakbeats and sampling with dub space, soul or jazz color and dark cinematic atmosphere.",
    "sounds": [
      "slow breakbeats",
      "samples",
      "sub-bass",
      "dub delay",
      "moody keyboards or strings"
    ]
  },
  "acid jazz": {
    "origin": "mid-to-late 1980s · London, United Kingdom",
    "description": "A club-oriented fusion of jazz, funk, soul, hip-hop and dance production, often balancing live musicianship with sampled or DJ-based rhythm.",
    "sounds": [
      "Rhodes or organ",
      "funk bass",
      "live drums or breakbeats",
      "horns",
      "samples"
    ]
  },
  "electronica": {
    "origin": "late 1980s–1990s · United Kingdom, Europe and North America",
    "description": "A broad umbrella for electronic music extending beyond strictly club-functional house and techno into home listening, hybrid production and album-oriented electronic composition.",
    "sounds": [
      "synthesizers",
      "samplers",
      "drum machines",
      "breakbeats or programmed rhythm",
      "processed electronic textures"
    ]
  },
  "ambient": {
    "origin": "mid-to-late 1970s · United Kingdom and European experimental scenes",
    "description": "Music centered on atmosphere, sustained texture, space and gradual change rather than a strongly foregrounded beat or conventional song form.",
    "sounds": [
      "sustained synthesizers",
      "drones",
      "processed acoustic sound",
      "field recordings",
      "reverb-rich texture"
    ]
  },
  "alternative rock": {
    "origin": "late 1970s–1980s · United States and United Kingdom underground scenes",
    "description": "A broad post-punk-era rock category united more by operating outside the mainstream than by one sound, spanning guitar pop, noise, punk-derived, industrial and experimental approaches.",
    "sounds": [
      "electric guitar",
      "bass",
      "drums",
      "vocals",
      "effects or electronics depending on substyle"
    ]
  },
  "indie rock": {
    "origin": "1980s · United States and United Kingdom independent-label scenes",
    "description": "Rock rooted in independent-label and DIY culture, allowing wide stylistic variation while favoring personal, non-mainstream songwriting and production choices.",
    "sounds": [
      "electric guitar",
      "bass",
      "drums",
      "vocals",
      "lo-fi or experimental production depending on artist"
    ]
  },
  "college rock": {
    "origin": "early-to-mid 1980s · United States college-radio networks",
    "description": "Alternative music circulated through college radio, drawing from post-punk, jangle pop, American underground rock and literate guitar songwriting.",
    "sounds": [
      "jangling guitars",
      "bass",
      "live drums",
      "melodic vocals",
      "clean or lightly effected production"
    ]
  },
  "power pop": {
    "origin": "early 1970s · United States and United Kingdom",
    "description": "Concise guitar pop combining hard-rock punch with bright melody, vocal harmony and ringing guitar textures, typically favoring compact song forms.",
    "sounds": [
      "ringing electric guitars",
      "bass",
      "live drums",
      "layered vocal harmonies",
      "three-minute pop structures"
    ]
  },
  "post-hardcore": {
    "origin": "early-to-mid 1980s · United States, especially Washington, D.C. and Chicago",
    "description": "Hardcore-derived rock that expands beyond short, fast forms through dynamic contrast, more complex guitar writing, tension-and-release and wider vocal delivery.",
    "sounds": [
      "electric guitars",
      "bass",
      "live drums",
      "whispered-to-yelled vocals",
      "dynamic stop/start arrangements"
    ]
  },
  "post-punk": {
    "origin": "late 1970s · United Kingdom and United States",
    "description": "An experimental expansion of punk's DIY ethos incorporating dub, disco, Krautrock, synthesizers, angular guitar and unconventional song structures.",
    "sounds": [
      "angular guitars",
      "prominent bass",
      "dry or motorik drums",
      "synthesizers",
      "dub- or disco-influenced rhythm"
    ]
  },
  "goth rock": {
    "origin": "late 1970s–early 1980s · United Kingdom",
    "description": "A post-punk offshoot built around dark, foreboding atmosphere, processed guitar, cold synthesizers, dramatic rhythm sections and introspective or romantic imagery.",
    "sounds": [
      "processed electric guitar",
      "bass",
      "drums",
      "cold synthesizers",
      "dramatic or baritone vocals"
    ]
  },
  "dream pop": {
    "origin": "mid-1980s · United Kingdom and international indie scenes",
    "description": "Atmospheric pop/rock emphasizing soft-focus guitar or synth texture, spacious production, melodic drift and vocals blended into the overall sound.",
    "sounds": [
      "chorused or reverberant guitars",
      "synth pads",
      "soft drums",
      "breathy vocals",
      "layered ambience"
    ]
  },
  "shoegaze": {
    "origin": "late 1980s–early 1990s · United Kingdom",
    "description": "British indie rock centered on overwhelming guitar texture, drones, distortion and feedback, with vocals and melody partially submerged into a dense wash.",
    "sounds": [
      "effects-heavy guitars",
      "feedback",
      "distortion",
      "sustained drones",
      "soft or obscured vocals"
    ]
  },
  "grunge": {
    "origin": "mid-to-late 1980s · Seattle, Washington, USA",
    "description": "A punk/metal hybrid combining heavy, fuzzy guitars with underground DIY attitude, stop-start dynamics and inward-looking or alienated songwriting.",
    "sounds": [
      "fuzzy distorted guitars",
      "bass",
      "live drums",
      "raw vocals",
      "quiet/loud dynamics"
    ]
  },
  "post-grunge": {
    "origin": "early-to-mid 1990s · United States",
    "description": "A mainstream hard-rock continuation of grunge that retained thick distorted guitars and introspection while favoring more polished, radio-oriented production.",
    "sounds": [
      "distorted guitars",
      "bass",
      "live drums",
      "earnest vocals",
      "polished hard-rock production"
    ]
  },
  "garage rock": {
    "origin": "mid-1960s · United States",
    "description": "Raw, direct rock associated with amateur or semi-professional bands, simple riff-based songwriting and an intentionally rough live feel.",
    "sounds": [
      "fuzz or overdriven guitar",
      "bass",
      "live drums",
      "organ on some recordings",
      "raw vocals"
    ]
  },
  "industrial rock": {
    "origin": "late 1980s · United States and United Kingdom/European industrial scenes",
    "description": "Rock combining distorted guitars and live-band weight with industrial electronics, programmed rhythm, sampling and abrasive production.",
    "sounds": [
      "distorted guitars",
      "drum machines",
      "samplers",
      "synthesizers",
      "processed or shouted vocals"
    ]
  },
  "progressive rock": {
    "origin": "1967–early 1970s · United Kingdom",
    "description": "Rock built around extended or multi-section forms, thematic development, concept-oriented writing and instrumental interplay influenced by classical, jazz and psychedelic music.",
    "sounds": [
      "electric guitar",
      "bass",
      "drums",
      "organ or Mellotron",
      "synthesizers"
    ]
  },
  "neo-prog": {
    "origin": "early 1980s · United Kingdom",
    "description": "A revival and modernization of 1970s progressive rock, often combining long forms and theatrical storytelling with cleaner 1980s production and synthesizers.",
    "sounds": [
      "electric guitar",
      "synthesizers",
      "bass",
      "live drums",
      "dramatic lead vocals"
    ]
  },
  "progressive metal": {
    "origin": "late 1980s · United States",
    "description": "Heavy metal combined with progressive rock's extended forms, technical ensemble writing and frequent rhythmic or harmonic complexity.",
    "sounds": [
      "high-gain guitars",
      "bass",
      "technical drums",
      "keyboards",
      "wide-range vocals"
    ]
  },
  "math rock": {
    "origin": "late 1980s–1990s · United States and United Kingdom",
    "description": "Rock characterized by intricate rhythmic organization, irregular meter, interlocking parts and highly precise ensemble playing.",
    "sounds": [
      "clean or angular guitars",
      "bass",
      "acoustic drums",
      "odd meters",
      "interlocking riffs"
    ]
  },
  "post-rock": {
    "origin": "early 1990s · United Kingdom and United States",
    "description": "Rock instrumentation used for texture, repetition, dynamics and long-form development rather than conventional riff-and-chorus songwriting.",
    "sounds": [
      "electric guitar used texturally",
      "bass",
      "drums",
      "ambient electronics",
      "gradual crescendos"
    ]
  },
  "krautrock": {
    "origin": "late 1960s–early 1970s · West Germany",
    "description": "A broad German experimental-rock movement combining repetition, electronic experimentation, minimalism, improvisation and forward-driving rhythm.",
    "sounds": [
      "motorik drums",
      "synthesizers",
      "electric guitar",
      "tape/electronic processing",
      "repetitive bass"
    ]
  },
  "psychedelic rock": {
    "origin": "1965–1966 · United States and United Kingdom",
    "description": "Rock that expanded conventional form through improvisation, Eastern influence and studio experimentation, often seeking immersive or altered-state effects.",
    "sounds": [
      "fuzz guitar",
      "sitar or drones",
      "feedback",
      "tape effects",
      "extended instrumental passages"
    ]
  },
  "psychedelic pop": {
    "origin": "mid-1960s · United States and United Kingdom",
    "description": "Psychedelic studio color applied to concise pop songwriting, retaining memorable melodies while adding altered timbres and unusual production.",
    "sounds": [
      "fuzz guitar",
      "backward or tape effects",
      "sitar",
      "stacked vocal harmonies",
      "bright pop arrangements"
    ]
  },
  "space rock": {
    "origin": "late 1960s–early 1970s · United Kingdom",
    "description": "Psychedelic/progressive rock emphasizing cosmic imagery, sustained repetition, electronic effects and long-form atmospheric improvisation.",
    "sounds": [
      "delay-heavy guitars",
      "synthesizers",
      "drones",
      "repetitive bass",
      "extended jams"
    ]
  },
  "stoner rock": {
    "origin": "early 1990s · United States, especially Southern California",
    "description": "Heavy rock combining Sabbath-like riff weight with psychedelic repetition, fuzz and a loose groove-oriented feel.",
    "sounds": [
      "fuzz guitar",
      "heavy bass",
      "live drums",
      "repetitive riffs",
      "psychedelic effects"
    ]
  },
  "desert rock": {
    "origin": "late 1980s–early 1990s · Palm Desert, California, USA",
    "description": "A Southern California heavy-psych scene associated with loose groove, low-tuned riffs, improvisation and raw live performance.",
    "sounds": [
      "fuzz guitar",
      "heavy bass",
      "live drums",
      "low-tuned riffs",
      "jam-oriented arrangements"
    ]
  },
  "punk rock": {
    "origin": "mid-1970s · New York City, USA and London, United Kingdom",
    "description": "Fast, direct rock built around DIY culture, concise structures, stripped-down instrumentation and confrontational or socially resistant attitude.",
    "sounds": [
      "distorted electric guitar",
      "bass",
      "fast live drums",
      "shouted or direct vocals",
      "short song forms"
    ]
  },
  "hardcore punk": {
    "origin": "late 1970s–early 1980s · United States, especially Los Angeles and Washington, D.C.",
    "description": "A faster, harder punk style emphasizing brevity, physical intensity, DIY ethics and aggressive ensemble attack.",
    "sounds": [
      "heavily distorted guitars",
      "fast drums",
      "bass",
      "shouted vocals",
      "short songs"
    ]
  },
  "emo": {
    "origin": "mid-1980s · Washington, D.C., USA",
    "description": "A hardcore/post-hardcore offshoot that foregrounded emotionally exposed writing, dynamic contrast and increasingly melodic or intricate guitar work.",
    "sounds": [
      "electric guitars",
      "bass",
      "live drums",
      "emotionally direct vocals",
      "quiet/loud dynamics"
    ]
  },
  "riot grrrl": {
    "origin": "early 1990s · Olympia, Washington and Washington, D.C., USA",
    "description": "A feminist punk movement joining raw DIY rock with confrontational lyrics about gender, power, violence, identity and participation.",
    "sounds": [
      "distorted guitars",
      "bass",
      "live drums",
      "shouted or direct vocals",
      "lo-fi DIY production"
    ]
  },
  "hard rock": {
    "origin": "late 1960s · United Kingdom and United States",
    "description": "Amplified riff-centered rock emphasizing volume, distorted guitar, a heavy rhythm section and forceful vocal performance.",
    "sounds": [
      "distorted electric guitar",
      "bass",
      "live drums",
      "strong lead vocals",
      "riff-driven arrangements"
    ]
  },
  "heavy metal": {
    "origin": "late 1960s–early 1970s · United Kingdom",
    "description": "Heavy riff-centered rock developed from hard rock and blues, emphasizing distorted guitar weight, dark or dramatic harmony and forceful performance.",
    "sounds": [
      "distorted electric guitars",
      "bass",
      "heavy drums",
      "powerful vocals",
      "riff-centered songwriting"
    ]
  },
  "hip-hop": {
    "origin": "1970s · Bronx, New York City, USA",
    "description": "A culture and musical form built around DJing, MCing and rhythmic vocal performance, with recorded hip-hop commonly organized through sampled or programmed beats.",
    "sounds": [
      "breakbeats",
      "turntable or sampled material",
      "drum machines",
      "bass",
      "rapped vocals"
    ]
  },
  "alternative hip-hop": {
    "origin": "mid-to-late 1980s · United States",
    "description": "Hip-hop that deliberately broadens mainstream rap conventions through unusual sampling, live instrumentation, abstract or introspective lyrics and cross-genre production.",
    "sounds": [
      "sampled beats",
      "drum machines",
      "unconventional samples",
      "live instruments",
      "rapped or spoken vocals"
    ]
  },
  "r&b": {
    "origin": "1940s onward · United States",
    "description": "A broad Black American popular-music lineage centered on groove, vocal expression and rhythm sections, later evolving into highly produced contemporary forms.",
    "sounds": [
      "lead and backing vocals",
      "bass",
      "drums",
      "keyboards",
      "guitar or electronic production"
    ]
  },
  "soul": {
    "origin": "late 1950s–1960s · United States",
    "description": "Black American popular music combining gospel-derived vocal intensity with rhythm-and-blues groove, secular songwriting and strong ensemble accompaniment.",
    "sounds": [
      "expressive vocals",
      "bass",
      "drums",
      "piano or organ",
      "horns and guitar"
    ]
  },
  "funk": {
    "origin": "mid-to-late 1960s · United States",
    "description": "Groove-centered Black American music emphasizing syncopation, interlocking rhythm, strong bass and drums, and repeated vamps over harmonic complexity.",
    "sounds": [
      "syncopated bass",
      "drums",
      "rhythm guitar",
      "horns",
      "clavinet or keyboards"
    ]
  },
  "jazz": {
    "origin": "early 20th century · New Orleans and wider United States",
    "description": "A Black American musical tradition centered on improvisation, swing or syncopated rhythm, distinctive harmony and interactive ensemble performance.",
    "sounds": [
      "horns",
      "piano",
      "upright or electric bass",
      "drums",
      "improvised solos"
    ]
  },
  "cool jazz": {
    "origin": "late 1940s–1950s · United States, especially West Coast and New York scenes",
    "description": "A jazz style favoring restrained dynamics, lighter tone, arranged ensemble detail and a comparatively relaxed rhythmic feel.",
    "sounds": [
      "saxophone or trumpet",
      "piano",
      "upright bass",
      "brushed drums",
      "carefully arranged ensembles"
    ]
  },
  "bossa nova": {
    "origin": "late 1950s · Rio de Janeiro, Brazil",
    "description": "Brazilian style blending samba rhythm with intimate vocal delivery and harmonically sophisticated, jazz-influenced songwriting.",
    "sounds": [
      "nylon-string guitar",
      "soft percussion",
      "piano",
      "subtle bass",
      "quiet vocals"
    ]
  },
  "reggae": {
    "origin": "late 1960s · Jamaica",
    "description": "Jamaican popular music built around offbeat guitar/keyboard accents, strong bass, syncopated groove and vocal or instrumental forms descended from ska and rocksteady.",
    "sounds": [
      "deep bass",
      "one-drop or related drum grooves",
      "offbeat guitar or organ",
      "vocals",
      "dub-style effects in some productions"
    ]
  },
  "dub": {
    "origin": "late 1960s–early 1970s · Jamaica",
    "description": "Studio-centered reggae offshoot that treats the mix itself as composition, stripping arrangements and emphasizing bass, drums, echo, reverb and spatial manipulation.",
    "sounds": [
      "deep bass",
      "drums",
      "tape or delay echo",
      "reverb",
      "dropouts and mixing-board effects"
    ]
  },
  "ska": {
    "origin": "late 1950s–early 1960s · Jamaica",
    "description": "Jamaican dance music combining Caribbean rhythm with American R&B and jazz, recognized by brisk tempo and offbeat guitar or piano accents.",
    "sounds": [
      "offbeat guitar or piano",
      "horn section",
      "walking bass",
      "drums",
      "energetic vocals"
    ]
  },
  "minimalism": {
    "origin": "1960s · United States, especially New York",
    "description": "A compositional movement centered on repetition, gradual process, sustained pulse and limited musical materials that change slowly over time.",
    "sounds": [
      "repeating patterns",
      "steady pulse",
      "acoustic ensembles or keyboards",
      "gradual phase/process changes",
      "sustained harmony"
    ]
  },
  "film score": {
    "origin": "early 20th century · Europe and United States film industries",
    "description": "Music composed to accompany moving images, shaping narrative, emotion, pacing, setting and thematic identity.",
    "sounds": [
      "orchestra or chamber ensemble",
      "piano",
      "electronic instruments",
      "recurring themes",
      "sound-design hybrids"
    ]
  }
};

const canonicalGenreByLabel = new Map(
  releaseDescriptorOntology
    .filter(
      (descriptor) =>
        descriptor.category === "genre",
    )
    .map((descriptor) => [
      normalizeDescriptorLabel(
        descriptor.label,
      ),
      descriptor,
    ]),
);

function getCanonicalGenreDescriptor(
  descriptor: ReleaseDescriptor,
): ReleaseDescriptor | null {
  if (descriptor.category === "genre") {
    return descriptor;
  }

  return (
    canonicalGenreByLabel.get(
      normalizeDescriptorLabel(
        descriptor.label,
      ),
    ) ?? null
  );
}

function getGenreKnowledge(
  genreDescriptor: ReleaseDescriptor,
): {
  knowledge: EditorialGenreKnowledge;
  isSpecific: boolean;
} | null {
  const labelKey =
    normalizeDescriptorLabel(
      genreDescriptor.label,
    );
  const specific =
    genreOverrides[labelKey];

  if (specific) {
    return {
      knowledge: specific,
      isSpecific: true,
    };
  }

  const lineage =
    genreLineages[
      `${genreDescriptor.family}|${genreDescriptor.subfamily}`
    ];

  if (!lineage) {
    return null;
  }

  return {
    isSpecific: false,
    knowledge: {
      origin:
        `${lineage.period} · ${lineage.places}`,
      description:
        `${lineage.description} ` +
        `${genreDescriptor.label} is a narrower classification within this lineage.`,
      sounds: lineage.sounds,
    },
  };
}

function formatGenreKnowledge(
  genreDescriptor: ReleaseDescriptor,
): string | null {
  const resolved =
    getGenreKnowledge(
      genreDescriptor,
    );

  if (!resolved) {
    return null;
  }

  const prefix =
    resolved.isSpecific
      ? "Origin"
      : "Lineage";

  return (
    `${prefix}: ${resolved.knowledge.origin}. ` +
    `${resolved.knowledge.description} ` +
    `Sounds: ${resolved.knowledge.sounds.join(", ")}.`
  );
}

/**
 * Category-neutral knowledge for descriptor labels that should mean the same
 * thing anywhere they appear.
 *
 * Examples:
 * - Progressive Rock carries the same history/sound explanation under Genre
 *   and Influences.
 * - "longing" carries the same lexical meaning under Mood and Themes.
 * - shared terms such as "abrasive", "warm", "motivic development", and
 *   "found sound" are not redefined merely because the profile category
 *   changes.
 */
export function getSharedEditorialDescriptorDefinition(
  descriptor: ReleaseDescriptor,
): string | null {
  const canonicalGenre =
    getCanonicalGenreDescriptor(
      descriptor,
    );

  if (canonicalGenre) {
    const genreDefinition =
      formatGenreKnowledge(
        canonicalGenre,
      );

    if (genreDefinition) {
      return genreDefinition;
    }
  }

  return (
    sharedLexicalDefinitions[
      normalizeDescriptorLabel(
        descriptor.label,
      )
    ] ?? null
  );
}

export function getEditorialGenreKnowledgeForDescriptor(
  descriptor: ReleaseDescriptor,
): EditorialGenreKnowledge | null {
  const canonicalGenre =
    getCanonicalGenreDescriptor(
      descriptor,
    );

  if (!canonicalGenre) {
    return null;
  }

  return (
    getGenreKnowledge(
      canonicalGenre,
    )?.knowledge ?? null
  );
}

export function getEditorialSharedLexicalDefinition(
  label: string,
): string | null {
  return (
    sharedLexicalDefinitions[
      normalizeDescriptorLabel(label)
    ] ?? null
  );
}
