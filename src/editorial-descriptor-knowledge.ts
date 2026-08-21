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

const harmonyTheoryDefinitions: Readonly<Record<string, string>> =
{
  "major tonality": "Tonal organization centered on a major tonic, typically using the major scale and functional relationships among tonic, predominant, and dominant harmony.",
  "natural minor tonality": "Minor-key organization based on the natural minor scale (1–2–♭3–4–5–♭6–♭7), with no raised leading tone unless additional minor-scale variants are introduced.",
  "harmonic minor": "A minor scale with a raised seventh degree (1–2–♭3–4–5–♭6–7), creating a leading tone to the tonic and the characteristic augmented second between scale degrees ♭6 and 7.",
  "melodic minor": "In classical usage, a minor scale that raises scale degrees 6 and 7 when ascending and normally restores them when descending; in jazz usage, the ascending form is typically used in both directions.",
  "major pentatonic": "A five-note scale built from scale degrees 1, 2, 3, 5, and 6 of the major scale, omitting the half-step-producing fourth and seventh degrees.",
  "minor pentatonic": "A five-note minor collection commonly spelled 1, ♭3, 4, 5, ♭7, widely used for melodic writing, riff construction, and improvisation across blues, rock, folk, and popular music.",
  "blues scale": "A blues-oriented hexatonic collection commonly formed by adding the lowered fifth (or raised fourth) to the minor pentatonic scale: 1, ♭3, 4, ♭5, 5, ♭7.",
  "chromatic scale": "The complete twelve-note collection of adjacent semitones within the octave, used for chromatic passing motion, altered harmony, symmetrical writing, or music not restricted to a seven-note diatonic collection.",
  "Ionian mode": "The major diatonic mode, with scale degrees 1–2–3–4–5–6–7; functionally equivalent in pitch content to the conventional major scale.",
  "Dorian mode": "A minor-type diatonic mode with a natural sixth: 1–2–♭3–4–5–6–♭7, giving it a brighter color than natural minor while retaining a minor third.",
  "Phrygian mode": "A minor-type diatonic mode with a lowered second: 1–♭2–♭3–4–5–♭6–♭7, producing a particularly dark and semitone-rich relationship above the tonic.",
  "Lydian mode": "A major-type diatonic mode with a raised fourth: 1–2–3–♯4–5–6–7, often creating a bright, floating quality and avoiding the conventional perfect-fourth pull above the tonic.",
  "Mixolydian mode": "A major-type diatonic mode with a lowered seventh: 1–2–3–4–5–6–♭7, common in rock, folk, blues, funk, and modal jazz.",
  "Aeolian mode": "The natural-minor diatonic mode: 1–2–♭3–4–5–♭6–♭7, with a minor third and no raised leading tone.",
  "Locrian mode": "A diatonic mode spelled 1–♭2–♭3–4–♭5–♭6–♭7, distinctive for its diminished fifth above the tonic and correspondingly unstable tonic triad.",
  "whole-tone scale": "A six-note symmetrical scale made entirely of whole steps, dividing the octave evenly and eliminating semitone resolution and conventional major/minor tonal hierarchy.",
  "octatonic half-whole scale": "An eight-note symmetrical scale alternating half step then whole step, often used over dominant or diminished harmony because its repeating structure supplies altered tensions and diminished-seventh subsets.",
  "octatonic whole-half scale": "An eight-note symmetrical scale alternating whole step then half step, strongly associated with diminished-seventh harmony and symmetrical melodic or harmonic writing.",
  "altered scale": "The seventh mode of melodic minor, commonly spelled 1–♭2–♯2/♭3–3–♭5–♯5/♭6–♭7, providing altered ninths and fifths over a dominant chord while retaining its major third and minor seventh.",
  "Lydian dominant": "The fourth mode of melodic minor: 1–2–3–♯4–5–6–♭7, combining Lydian's raised fourth with Mixolydian's lowered seventh and commonly used over dominant seventh chords with a ♯11 color.",
  "Locrian sharp 2": "The sixth mode of melodic minor: 1–2–♭3–4–♭5–♭6–♭7, a Locrian collection with a natural second often used over half-diminished harmony.",
  "Lydian augmented": "The third mode of melodic minor: 1–2–3–♯4–♯5–6–7, combining Lydian's raised fourth with an augmented fifth for a bright, harmonically unstable major sound.",
  "Mixolydian flat 6": "The fifth mode of melodic minor: 1–2–3–4–5–♭6–♭7, combining a dominant seventh framework with a lowered sixth for a darker dominant color.",
  "bebop dominant scale": "An eight-note dominant scale formed by adding a major seventh passing tone to Mixolydian, allowing chord tones to fall more consistently on strong beats during continuous eighth-note lines.",
  "bebop major scale": "An eight-note major scale that adds a chromatic passing tone between scale degrees 5 and 6, commonly notated as ♯5/♭6, to support rhythmically even bebop lines.",
  "hexatonic scale": "Any six-note scale or pitch collection; the term describes cardinality rather than one fixed interval pattern, so whole-tone and several other six-note collections are all hexatonic.",
  "diatonic harmony": "Harmony built primarily from notes and chords belonging to a prevailing diatonic key or mode, with little or no chromatic alteration.",
  "functional harmony": "Tonal harmony organized by directional roles such as tonic, predominant, and dominant, where chords gain meaning partly from how they prepare, intensify, and resolve toward tonal goals.",
  "triadic harmony": "Harmony whose basic sonorities are three-note chords built from a root, third, and fifth, including major, minor, diminished, and augmented triads.",
  "seventh-chord harmony": "Harmony that regularly uses four-note chords formed by adding a seventh above a triad, expanding color and voice-leading possibilities beyond simple triads.",
  "tonic-dominant motion": "Harmonic movement defined by the relationship between tonic and dominant, especially dominant-to-tonic resolution driven by scale degree 5, the leading tone, and cadential voice leading.",
  "circle-of-fifths motion": "Root movement by descending fifths or ascending fourths, often creating strong directional harmonic momentum through successive dominant-like relationships.",
  "plagal motion": "Harmonic motion from the subdominant region toward tonic, classically IV–I or iv–I, producing a resolution distinct from dominant-to-tonic cadential motion.",
  "pedal-point harmony": "Harmony that changes above or around a sustained or repeated pitch—often tonic or dominant—so the stationary note alternately agrees with and conflicts against surrounding chords.",
  "suspended harmony": "Harmony in which chord tones are replaced or delayed by adjacent scale tones, commonly producing suspended-second or suspended-fourth sonorities that defer a conventional third or resolution.",
  "power-chord harmony": "Harmony centered on root-and-fifth sonorities, usually omitting the third so major/minor quality remains ambiguous and the interval structure tolerates heavy distortion well.",
  "modal mixture": "Borrowing chords or scale degrees from the parallel major or minor mode while retaining the same tonic, such as using iv or ♭VI in an otherwise major-key passage.",
  "borrowed chords": "Chords imported from a parallel mode or another closely related scalar collection without necessarily establishing a new tonic, adding chromatic color within the prevailing key.",
  "secondary dominants": "Dominant-function chords that temporarily tonicize a diatonic chord other than the home tonic, typically written V/x and containing at least one chromatic pitch.",
  "secondary diminished chords": "Leading-tone diminished or diminished-seventh chords that temporarily tonicize a scale degree other than the home tonic, functioning as vii°/x or vii°7/x.",
  "diminished seventh harmony": "Harmony using fully diminished seventh chords, whose stacked minor thirds create symmetrical structure, strong semitone voice leading, and multiple possible enharmonic resolutions.",
  "Neapolitan harmony": "Harmony built around the major chord on lowered scale degree 2, classically most often in first inversion (N6 or ♭II6) and functioning as a chromatic predominant before dominant harmony.",
  "augmented-sixth harmony": "Predominant harmony containing the characteristic interval ♭6 to ♯4, whose voices normally expand outward by semitone to scale degree 5; Italian, French, and German forms add different inner tones.",
  "chromatic mediant relationships": "Relationships between chords whose roots are a third apart but whose qualities or pitch content do not belong to one diatonic key, often sharing one common tone while producing vivid chromatic shifts.",
  "enharmonic modulation": "Modulation achieved by respelling one or more pitches so an existing chord is reinterpreted with a new harmonic function in another key, frequently using diminished-seventh or augmented-sixth sonorities.",
  "chromatic voice leading": "Voice leading in which one or more parts move by semitone outside the prevailing diatonic collection, often connecting otherwise distant chords smoothly.",
  "chromatic harmony": "Harmony that uses pitches or chords outside the prevailing diatonic key through alteration, tonicization, mixture, modulation, or other non-diatonic procedures.",
  "tertian harmony": "Harmony constructed primarily by stacking thirds, the organizing principle behind conventional triads, seventh chords, and most extended ninth, eleventh, and thirteenth chords.",
  "quartal harmony": "Harmony built primarily from stacked fourths rather than thirds, producing open sonorities that can sound modal, ambiguous, or less conventionally functional.",
  "quintal harmony": "Harmony built from stacked fifths, creating wide open spacing closely related by inversion to quartal harmony but often with a more spacious or resonant sonority.",
  "secundal harmony": "Harmony built from stacked seconds, producing tightly spaced sonorities that range from mild added-note color to dense dissonant clusters.",
  "extended jazz harmony": "Tertian or altered chord vocabulary that regularly includes ninths, elevenths, thirteenths, substitutions, altered dominants, and color tones beyond basic triads and seventh chords.",
  "cluster harmony": "Harmony made from several adjacent or closely spaced pitches, often seconds apart, forming dense sonorities whose effect depends more on register, spacing, and texture than conventional chord function.",
  "polychordal harmony": "Two or more recognizable chords sounding simultaneously or in tightly superimposed layers, producing compound sonorities that can imply multiple harmonic centers at once.",
  "pandiatonic harmony": "Free use of the notes of a diatonic collection without relying strongly on traditional functional progression, allowing non-tertian combinations and added-note sonorities while remaining within one scale collection.",
  "harmonic planing": "Parallel movement of an unchanged chord shape or interval structure through different pitch levels, prioritizing consistent voicing and color over traditional functional voice leading.",
  "harmonic ambiguity": "Harmony that avoids clearly establishing one chord function, tonic, mode, or key through shared tones, incomplete chords, pedals, modal mixture, symmetrical collections, or competing centers.",
  "non-functional harmony": "Chord succession organized by color, voice leading, symmetry, repetition, planing, or other relationships rather than conventional tonic–predominant–dominant functional syntax.",
  "classical voice leading": "Part-writing practice that treats each chord member as an individual melodic line, favoring smooth motion, controlled dissonance, complete chord spelling, and avoidance of objectionable parallels in common-practice styles.",
  "smooth voice leading": "Connection of successive harmonies by retaining common tones and moving individual voices by the smallest practical intervals, especially stepwise motion.",
  "contrary motion": "Contrapuntal motion in which two voices move in opposite directions, one ascending while the other descends.",
  "parallel motion": "Contrapuntal motion in which two voices move in the same direction by the same generic interval, preserving the interval class between them.",
  "oblique motion": "Contrapuntal motion in which one voice remains stationary while another voice moves.",
  "counterpoint": "The combination of two or more simultaneous melodic lines that retain meaningful independence while forming a coherent harmonic and rhythmic whole.",
  "imitative counterpoint": "Counterpoint in which a melodic idea introduced by one voice is subsequently restated or transformed in another voice, often at a different pitch level or time offset.",
  "canon": "Strict imitation in which one voice reproduces another voice's melody after a fixed delay, sometimes at the same pitch and sometimes transformed by interval, inversion, augmentation, or other rule.",
  "contrapuntal layering": "Arrangement built from several distinct melodic or rhythmic lines sounding together, with each layer contributing independent motion rather than merely doubling one chordal texture.",
  "inner-voice motion": "Melodic movement within voices between the bass and highest line, using those internal parts to connect chords, create suspensions, add counterlines, or reshape harmonic color.",
  "common-tone voice leading": "Voice leading that preserves one or more pitches across a chord change while the remaining voices move, creating continuity between otherwise different sonorities.",
  "motivic development": "The transformation and reuse of a short musical idea through repetition, variation, transposition, fragmentation, inversion, augmentation, diminution, or related techniques.",
  "sequence": "Repetition of a melodic or harmonic pattern at successively higher or lower pitch levels, preserving its internal interval or harmonic design while transposing the pattern.",
  "melodic inversion": "Transformation of a melody or motif by reversing interval direction so an upward motion becomes downward and vice versa, while retaining the interval sizes as closely as the system allows.",
  "augmentation": "Rhythmic transformation in which the durations of a motif or melody are proportionally lengthened, making the same contour unfold more slowly.",
  "diminution": "Rhythmic transformation in which the durations of a motif or melody are proportionally shortened, making the same contour unfold more quickly.",
  "retrograde": "Transformation in which the order of pitches, rhythms, or both is reversed so the musical material proceeds backward from its original sequence.",
  "ostinato": "A short rhythmic, melodic, harmonic, or bass pattern repeated persistently while other musical material changes around it.",
  "call and response": "A musical exchange in which one phrase functions as a call and a following phrase from another voice, instrument, group, or register answers it.",
  "stepwise melody": "A melodic line dominated by movement to adjacent scale degrees or semitone/whole-tone neighbors rather than frequent leaps.",
  "angular melody": "A melodic contour shaped by abrupt changes of direction, wider or unexpected intervals, irregular accents, or disjunct motion rather than smooth stepwise flow.",
  "wide-interval melody": "A melody that prominently uses leaps larger than seconds or thirds, creating broad registral movement and a more spacious or dramatic contour.",
  "scalar melody": "A melody organized largely as consecutive notes of a scale or mode, moving through recognizable scalar fragments rather than primarily outlining chords.",
  "arpeggiated melody": "A melodic line built substantially from the separated chord tones of arpeggios, outlining harmony through sequential rather than simultaneous chord members.",
  "pedal-tone melody": "A melodic texture in which one pitch is sustained or repeatedly returned to while other melodic notes move around it, creating a persistent reference tone.",
  "verse-chorus form": "A song form alternating verses with a recurring chorus, typically using verses for changing lyrical or narrative material and the chorus for the principal repeated hook or refrain.",
  "strophic form": "A form in which successive verses or stanzas use essentially the same music, with lyrical text changing while the large-scale musical structure repeats.",
  "through-composed form": "A form that continues developing new musical material rather than relying primarily on repeated verse, chorus, or strophic sections.",
  "binary form": "A two-part form organized as A–B, commonly with each large section repeated and often with the second section continuing or resolving tonal motion begun in the first.",
  "ternary form": "A three-part form organized as A–B–A, with a contrasting middle section followed by a return of the opening material.",
  "rondo-like form": "A refrain-based form in which a recurring principal section alternates with contrasting episodes, approximating patterns such as A–B–A–C–A without requiring strict classical rondo design.",
  "suite form": "A multi-movement or multi-section design that groups contrasting but related pieces or sections into a larger whole, often unified by key, concept, instrumentation, or recurring material.",
  "multi-part form": "A large-scale design containing several distinct sections or movements whose sequence exceeds a simple binary, ternary, or verse–chorus scheme.",
  "conceptual song cycle": "A sequence of songs designed as a larger unified work through recurring narrative, characters, themes, musical motives, tonal planning, or a shared conceptual arc.",
  "thematic reprise": "The return of an earlier musical theme, motif, lyric, or section later in a piece or release to create continuity or transformation.",
  "cyclical form": "Large-scale form in which musical material returns across separated sections or movements, creating structural unity through recurring themes, motives, tonal plans, or transformed reprises.",
  "extended instrumental form": "A long-form instrumental design that develops through multiple sections, solos, transitions, thematic transformations, textural changes, or cumulative processes rather than a compact song template."
};

const productionDefinitions: Readonly<Record<string, string>> =
{
  "live-room recording": "Recording that deliberately captures the acoustics of the performance space along with the direct instruments, using room reflections and natural ambience as part of the final sound.",
  "room bleed": "Sound from one instrument or source leaking into microphones intended for other sources, sometimes retained deliberately because it adds cohesion, depth, timing interaction, and a sense of a shared room.",
  "close-miking": "Placing a microphone near a source to emphasize direct sound, detail, attack, and isolation while reducing the proportion of room ambience captured.",
  "dry close-miking": "Close microphone placement combined with acoustically controlled capture and minimal room contribution, producing a focused signal that can be shaped later with artificial ambience or effects.",
  "ambient room mics": "Microphones positioned away from the source to capture reflections, decay, ensemble blend, and the acoustic character of the room rather than primarily direct sound.",
  "single-room ensemble tracking": "Recording multiple performers together in the same acoustic space so timing, bleed, room response, and interpersonal interaction become part of the captured performance.",
  "live-off-the-floor tracking": "Recording the core band or ensemble simultaneously in real time rather than building the performance entirely through isolated overdubs, preserving shared timing and spontaneous interaction.",
  "overdub-heavy production": "A recording approach built through many separately recorded layers, doubles, replacements, harmonies, textures, or instrumental additions rather than relying mainly on one ensemble take.",
  "home-studio recording": "Recording created primarily in a personal or non-commercial studio environment, often using compact rooms, project-studio equipment, software instruments, and flexible overdub-based workflows.",
  "lo-fi recording": "Recording that retains or deliberately introduces limited bandwidth, noise, distortion, inexpensive-device coloration, room artifacts, or reduced technical polish as part of the aesthetic.",
  "high-fidelity studio recording": "Capture aimed at low noise, wide bandwidth, controlled acoustics, accurate transients, and detailed signal reproduction using professional studio technique and monitoring.",
  "re-amping": "Sending a previously recorded dry signal back out through an amplifier, speaker, pedal chain, room, or other external device and recording the processed result so tone can be chosen after the original performance.",
  "amp-room ambience": "Room microphones or distant capture used around a loudspeaker or guitar/bass amplifier to blend direct cabinet tone with reflections, air movement, distance, and the acoustic signature of the room.",
  "DI bass recording": "Recording electric bass directly through a DI path rather than relying only on a miked amplifier, yielding a clean full-range signal with strong transient definition and controllable low end.",
  "double-tracked guitars": "Two separately performed recordings of the same or similar guitar part layered together, often panned apart, so small performance differences create greater width, density, and apparent size.",
  "multi-tracked vocals": "Multiple separately recorded vocal performances layered for thickness, width, emphasis, harmony, ensemble effect, or deliberate variation beyond a single lead take.",
  "parallel compression": "A heavily compressed copy of a signal is blended with the less-compressed or uncompressed original, increasing density, sustain, and low-level detail while retaining more of the original transient shape and dynamics.",
  "bus compression": "Compression applied to a grouped set of tracks or the mix bus so their combined dynamics are controlled together, often creating greater cohesion, shared movement, or peak control.",
  "sidechain compression": "Compression whose gain reduction is controlled by a separate key signal, allowing one source—such as a kick drum—to dynamically reduce another source when the trigger occurs.",
  "sidechain ducking": "Automatic level reduction of one signal in response to another signal, commonly used to create space for a kick, vocal, or other priority element without relying on fixed volume automation.",
  "transient shaping": "Dynamics processing that changes the attack and sustain portions of a sound independently, allowing hits to become sharper, softer, shorter, punchier, or more sustained without conventional threshold-based compression alone.",
  "limiting": "High-ratio dynamics control that prevents signal peaks from exceeding a chosen ceiling, used for peak protection, loudness management, transient containment, or deliberate density.",
  "upward compression": "Dynamics processing that raises quieter material more than loud material, increasing low-level detail and apparent sustain without reducing peaks in the same way as conventional downward compression.",
  "pumping compression": "Compression with sufficiently audible attack-and-release behavior that the signal level rises and falls rhythmically, often synchronized to drums or used deliberately as a movement effect.",
  "plate reverb": "Reverberation modeled on or produced by a vibrating metal plate, known for a dense, smooth decay that adds spaciousness and sustain without closely imitating a natural room.",
  "spring reverb": "Reverberation produced by or modeled on vibrating metal springs, creating a resonant, splashy, metallic decay strongly associated with guitar amplifiers, dub, and vintage studio effects.",
  "hall reverb": "Reverb designed to resemble a large concert hall, typically using longer decay, broad diffusion, and a strong sense of depth and scale.",
  "room reverb": "Short-to-medium reverberation that simulates an enclosed room, using early reflections and decay to establish believable distance, size, and acoustic placement around a source.",
  "reverse reverb": "A reverb envelope or reversed ambience that swells toward the dry sound instead of naturally decaying away from it, creating anticipation, suction, or an unnatural lead-in.",
  "gated reverb": "A dense reverb or room signal whose decay is abruptly cut by a gate or nonlinear envelope, producing a large burst of ambience that stops suddenly instead of fading naturally.",
  "slapback delay": "A single short echo, commonly tens to roughly a hundred milliseconds after the dry sound, used to create thickness, rhythmic bounce, and a compact sense of space without a long repeating tail.",
  "tape delay": "Delay produced by or modeled on magnetic tape loops, where repeats commonly accumulate saturation, filtering, pitch instability, and mechanical modulation as they feed back.",
  "dub delay": "Tempo-aware echo treated as an active performance element, often using high feedback, filtering, sends, dropouts, and real-time manipulation so repeats evolve through the mix.",
  "ping-pong delay": "A stereo delay in which successive echoes alternate or move between left and right channels, creating rhythmic width and obvious lateral motion.",
  "feedback delay": "Delay that routes part of its output back into its input so echoes repeat multiple times, with the feedback amount determining how long and how strongly the repetitions persist.",
  "pre-delay shaping": "Adjustment of the time between the dry sound and the onset of reverb, separating the source from the reverberant field and changing perceived distance, clarity, and room size.",
  "wide stereo ambience": "Reverb, delay, room tone, or diffuse effects spread broadly across the stereo field so environmental information extends beyond the apparent width of the dry source.",
  "mono ambience": "Reverb, delay, or room texture deliberately collapsed or generated in mono, creating a focused spatial layer that can sit behind or around a source without increasing stereo width.",
  "automated spatial movement": "Time-varying automation of pan, stereo width, delay, reverb, or spatial effects so a sound changes apparent position, distance, or width during the arrangement.",
  "tape saturation": "Harmonic coloration modeled on or produced by magnetic tape as level approaches saturation, typically adding soft compression, rounded transients, harmonic density, and frequency-dependent coloration.",
  "tube saturation": "Harmonic distortion and gentle dynamic compression associated with driven vacuum-tube circuitry, commonly adding even-order richness, softened transients, and perceived warmth.",
  "amp distortion": "Distortion created by driving an amplifier or amplifier model beyond its clean operating range, adding harmonics, compression, sustain, and frequency coloration from the gain stages and speaker system.",
  "fuzz distortion": "Extreme clipping that reshapes the waveform into a dense, buzzy, highly saturated tone with strong added harmonics, reduced dynamic nuance, and often long sustain.",
  "overdrive": "Moderate nonlinear distortion associated with an amplifier or overdrive circuit being pushed past clean headroom, adding harmonic grit and compression while usually preserving more note articulation than fuzz.",
  "bitcrushing": "Digital distortion created by reducing bit depth, producing quantization noise, stepped amplitude resolution, gritty high-frequency artifacts, and an intentionally degraded digital texture.",
  "soft clipping": "Nonlinear peak shaping that rounds the waveform gradually as it exceeds a threshold, adding harmonics and controlling peaks with a smoother transition into distortion.",
  "hard clipping": "Abrupt truncation of waveform peaks beyond a threshold, producing stronger high-order harmonics, aggressive distortion, and more severe transient flattening than soft clipping.",
  "speaker breakup": "Nonlinear coloration that occurs when a loudspeaker or speaker model is driven beyond clean excursion, adding compression, harmonic roughness, cone-related distortion, and dynamic texture.",
  "lo-fi filtering": "Deliberate reduction or reshaping of bandwidth—often through high-pass, low-pass, resonant, telephone-like, or device-emulation filtering—to create a smaller, older, distant, or degraded tonal character.",
  "subtractive synthesis": "Synthesis that begins with harmonically rich oscillator waveforms and removes parts of their spectrum with filters, while envelopes and modulation shape amplitude, timbre, and movement over time.",
  "FM synthesis": "Frequency-modulation synthesis in which one oscillator changes the frequency of another at audio rate, generating complex sidebands, metallic tones, bells, basses, and highly dynamic digital timbres.",
  "wavetable synthesis": "Digital synthesis that reads from a table of single-cycle waveforms and can move or morph through different wave shapes over time, creating evolving timbre from a continuously changing oscillator source.",
  "granular synthesis": "Synthesis or processing that divides audio into very short grains and reorganizes, layers, stretches, scatters, or modulates them to create clouds, textures, time-smearing, or radically transformed sound.",
  "additive synthesis": "Synthesis that constructs complex timbre by combining many simpler sinusoidal partials, with control over each partial's frequency, amplitude, and often envelope or modulation.",
  "resampling": "Recording the output of an existing sound or processing chain back into audio so the result can be edited, repitched, layered, sliced, processed again, or used as a new source.",
  "sample chopping": "Dividing a recording into smaller fragments that can be rearranged, retriggered, repeated, or mapped to pads/keys to create new rhythmic, melodic, or structural material.",
  "sample manipulation": "Transforming recorded audio through editing, repitching, stretching, reversing, filtering, modulation, effects, envelope shaping, or sequencing until the sample serves a new musical function.",
  "time-stretching": "Changing the duration or tempo of recorded audio independently from, or with reduced impact on, pitch so material can be fitted to new timing, elongated, compressed, or used for textural effects.",
  "pitch-shifting": "Changing the perceived pitch of recorded audio without simply replaying it at a different speed, allowing transposition, harmonization, octave effects, or deliberately artificial pitch treatment.",
  "vocoder processing": "Analysis of the spectral envelope of one signal—often speech—used to shape another carrier signal such as a synthesizer, producing articulated synthetic voices and talking-instrument textures.",
  "formant shifting": "Changing the resonant frequency structure that determines vocal or instrument timbre while attempting to preserve fundamental pitch, making a source sound larger, smaller, darker, brighter, or less natural.",
  "ring modulation": "Multiplication of two signals that produces new sum-and-difference frequencies while suppressing the originals, often yielding metallic, bell-like, clangorous, or inharmonic spectra.",
  "frequency shifting": "Moving every spectral component by a fixed frequency amount rather than a musical interval, changing harmonic relationships and often creating increasingly inharmonic or phase-like effects.",
  "noise layering": "Blending broadband, filtered, mechanical, environmental, or synthesized noise with another sound to add attack, air, grit, width, movement, or a more complex spectral envelope.",
  "LFO modulation": "Using a low-frequency oscillator to repeatedly vary a parameter such as pitch, filter cutoff, amplitude, pan, or effects depth, creating cyclical motion including vibrato, tremolo, sweeps, and rhythmic modulation.",
  "filter automation": "Changing filter cutoff, resonance, type, or related parameters over time so the spectral balance evolves as part of the arrangement or sound design.",
  "arpeggiator sequencing": "Automatic generation of repeated note patterns from held notes or chords according to an order, rate, octave range, gate length, or rhythm, turning harmony into a sequenced melodic-rhythmic figure.",
  "layered supersaws": "Multiple wide supersaw-style synth voices stacked across octaves, voicings, detune amounts, or processing layers to create an especially dense, bright, and expansive harmonic mass.",
  "Reese bass design": "Bass sound design based on multiple slightly detuned oscillators or similarly beating sources, often filtered and processed so phase interaction creates a dark, moving, growling low-mid texture.",
  "mid-side processing": "Stereo processing performed after encoding left/right audio into Mid (sum) and Side (difference) components so EQ, compression, saturation, or level can be adjusted differently for shared versus stereo-difference information.",
  "stereo widening": "Processing that increases perceived left-right spread through level, delay, phase, decorrelation, panning, or Mid/Side changes, ideally while monitoring mono compatibility and image stability.",
  "narrow mono imaging": "Deliberate reduction of stereo difference so a signal occupies a tighter central image, often improving focus, mono compatibility, or separation from wider surrounding elements.",
  "subtractive EQ": "Equalization that primarily cuts unwanted or competing frequencies rather than boosting desired ones, used to reduce resonances, mud, masking, harshness, or excess tonal weight.",
  "dynamic EQ": "Equalization whose gain changes in response to signal level or another trigger, allowing a frequency range to be cut or boosted only when its energy crosses a chosen condition.",
  "multiband compression": "Dynamics processing that splits the spectrum into frequency bands and compresses each band independently, allowing level control of one region without applying identical gain reduction to the entire signal.",
  "parallel distortion": "A distorted or saturated copy of a signal is blended with the cleaner original, adding harmonic density, edge, or perceived loudness while retaining some unprocessed transient and tonal information.",
  "automation-driven mixing": "Mix balance shaped through time-varying changes to faders, pans, sends, effects, EQ, dynamics, or other parameters so important elements and transitions evolve deliberately across the arrangement.",
  "frequency carving": "Targeted EQ used to reduce overlapping spectral energy between competing sources, creating complementary frequency space so important parts remain more distinct in the combined mix.",
  "low-end mono control": "Management of bass frequencies so the deepest low end contains little or no stereo-difference information, improving image stability, phase compatibility, and predictable reproduction on mono or club systems.",
  "surgical filtering": "Narrow, precise filtering or EQ used to isolate and remove specific resonances, hums, whistles, harsh bands, subsonic energy, or other localized frequency problems.",
  "creative phase manipulation": "Intentional alteration of phase relationships through all-pass filtering, delay, polarity, modulation, or phase-based effects to change timbre, stereo width, cancellation patterns, or movement rather than only correcting alignment.",
  "hard edits": "Clearly audible, abrupt cuts between regions, takes, samples, or sections, used as a structural or rhythmic device rather than disguising the edit with seamless crossfades.",
  "micro-edits": "Very short cuts, repeats, mutes, rearrangements, or replacements at note, transient, syllable, or sub-beat scale, used to refine timing or create intricate digital rhythmic detail.",
  "stutter edits": "Rapid repetition of a short audio fragment, often rhythmically quantized and varied in length, rate, or pitch to create machine-gun, glitch, build, or transition effects.",
  "glitch editing": "Deliberate use of tiny cuts, buffer-like repeats, digital errors, dropouts, abrupt rearrangements, clicks, or fragmented timing as compositional sound rather than accidental defect.",
  "reverse edits": "Audio regions played backward so attacks become swells, decays lead into new events, and familiar material gains reversed timing, envelope, and transition behavior.",
  "dropout edits": "Intentional removal or muting of selected beats, instruments, frequency layers, or full-mix moments to create negative space, rhythmic surprise, tension, or emphasis when the sound returns.",
  "loop-based construction": "Arrangement assembled substantially from repeating audio or MIDI cycles, with structure created by layering, muting, variation, processing, and transitions around those recurring loops.",
  "sample collage": "Composition built from multiple contrasting sampled sources—music, speech, ambience, effects, or found audio—layered and juxtaposed into a new sonic narrative or texture.",
  "cut-up arrangement": "A form created by slicing existing performances or sections into fragments and recombining them in new orders, often producing abrupt structural contrast or non-linear continuity.",
  "tempo automation": "Programmed changes to the project's tempo over time, including gradual accelerando/ritardando or abrupt BPM shifts that alter pacing, synchronization, and the feel of time-based processing.",
  "varispeed": "Tape-style speed manipulation in which playback or recording rate changes pitch and tempo together, preserving their mechanical relationship instead of independently time-stretching or pitch-shifting the audio.",
  "tape-stop effects": "A stylized slowdown modeled on stopping analog tape or a turntable, causing tempo and pitch to fall together until the sound halts, often used at transitions or phrase endings.",
  "beat slicing": "Dividing rhythmic audio into individual hits or small beat fragments so they can be reordered, retriggered, quantized, repeated, omitted, or processed independently."
};

const musicalElementDefinitions: Readonly<Record<string, string>> =
{
  "distorted guitar riffs": "Repeated guitar figures shaped by overdrive, distortion, or fuzz so the notes gain harmonic saturation, compression, sustain, and a heavier or more aggressive edge.",
  "clean guitar arpeggios": "Chord tones played one note at a time with little or no distortion, emphasizing note separation, resonance, harmonic movement, and often a spacious or delicate feel.",
  "jangling guitars": "Bright, ringing guitar textures built from open strings, upper-register voicings, clean amplification, and overlapping sustain, often associated with chiming folk-rock and indie guitar sounds.",
  "fuzz guitar": "Electric guitar processed with heavy waveform clipping that produces a thick, buzzy, harmonically dense tone with softened attack and long sustain.",
  "feedback-drenched guitars": "Guitar parts in which amplified signal feeds back through the speakers, creating sustained pitches, overtones, squeals, drones, and unstable layers of controlled noise.",
  "wall-of-guitars texture": "A dense composite guitar sound created through multiple overdubs, doubled parts, distortion, sustain, and overlapping frequency ranges until individual lines merge into a broad mass.",
  "interlocking guitar lines": "Two or more guitar parts designed to fit together rhythmically or melodically, with complementary notes, rests, accents, or registers forming a larger combined pattern.",
  "palm-muted riffs": "Guitar figures played while the picking hand lightly damps the strings near the bridge, shortening sustain and producing a tight, percussive attack.",
  "down-tuned guitar chugs": "Low-register, heavily articulated guitar figures played in reduced tunings, commonly using repeated palm-muted attacks to create weight, pulse, and a mechanical rhythmic drive.",
  "angular guitar figures": "Guitar lines characterized by abrupt intervals, clipped rhythms, dissonant shapes, sharp accents, or irregular contours rather than smooth melodic flow.",
  "chiming guitar voicings": "Clear, resonant chord shapes that emphasize ringing open strings, upper extensions, sustained overtones, and bright note separation.",
  "slide guitar textures": "Guitar sounds produced by moving a slide along the strings, creating continuous pitch transitions, glissandi, vocal-like inflection, and sustained bends between notes.",
  "sustained guitar drones": "Long-held or repeatedly reinforced guitar tones that establish a continuous pitch field, pedal tone, or textural bed beneath changing material.",
  "harmonized guitar leads": "Lead-guitar melodies doubled by another line at a consistent or changing interval, creating parallel harmony and a thicker melodic contour.",
  "counterpoint guitar lines": "Independent guitar melodies sounding simultaneously, each retaining its own contour and rhythmic identity while interacting harmonically with the others.",
  "single-note ostinato riffs": "A repeated one-note or narrowly pitched guitar figure whose rhythmic recurrence supplies momentum, tension, or a stable anchor beneath changing harmony.",
  "power-chord movement": "Progressions driven by root-and-fifth guitar shapes, usually omitting the third so the harmony remains open, forceful, and compatible with heavy distortion.",
  "open-string drones": "Sustained or repeatedly sounded open strings held beneath changing fretted notes or chords, creating a constant resonant pitch against moving harmony.",
  "acoustic piano figures": "Recognizable piano gestures such as arpeggios, repeated chords, melodic fragments, ostinatos, or rhythmic accompaniment performed on acoustic piano.",
  "electric piano chords": "Chordal material played on electro-mechanical or modeled electric piano tones, typically offering a softer attack, rounded sustain, and bell-like or warm harmonic color.",
  "Mellotron layers": "Sustained keyboard textures modeled on the Mellotron's tape-recorded instrument sounds, especially its characteristic strings, choir, and flute timbres with slightly unstable vintage coloration.",
  "Hammond organ": "The electromechanical Hammond organ, known for sustained tone, drawbar-controlled timbre and, often, rotating-speaker coloration.",
  "synthesizer arpeggios": "Synthesized chord tones articulated sequentially in repeating or evolving patterns, often synchronized to tempo and used to create harmonic motion and rhythmic propulsion.",
  "analog synth pads": "Sustained, slowly evolving synthesizer chords or tones with the rounded, continuously variable character associated with analog oscillators, filters, and modulation.",
  "digital synth textures": "Synthesized timbres shaped by digital methods such as wavetable, FM, additive, granular, or sampled synthesis, often producing precise, glassy, complex, or highly animated spectra.",
  "sequenced synthesizer lines": "Synth parts whose pitch, rhythm, velocity, or modulation is organized as a repeating programmed sequence, allowing precise cyclical movement and gradual variation.",
  "piano ostinatos": "Repeated piano patterns—pitched, rhythmic, or both—that persist beneath changing harmony, melody, orchestration, or dynamics.",
  "organ drones": "Long-held organ tones or chords used as a continuous harmonic field, pedal point, or sustained background texture.",
  "synth bass": "Bass-register material generated electronically with a synthesizer, allowing precise control over waveform, filter, envelope, modulation, and low-frequency weight.",
  "supersaw chords": "Chords voiced with multiple slightly detuned sawtooth oscillators, producing a wide, dense, bright synth texture strongly associated with trance and later festival-oriented electronic production.",
  "acid basslines": "Resonant, squelching sequenced bass figures associated with the Roland TB-303 sound, shaped through cutoff, resonance, accents, slides, and repetitive note patterns.",
  "live drum grooves": "Rhythmic patterns performed by a drummer on an acoustic or hybrid kit, preserving human timing, dynamics, articulation, fills, and interaction between limbs.",
  "electronic percussion": "Percussive sounds generated or heavily processed electronically, including synthesized drums, sampled hits, metallic transients, clicks, noise bursts, and non-acoustic rhythmic timbres.",
  "drum-machine patterns": "Programmed rhythms built from a drum machine or its characteristic sounds, typically using sequenced kick, snare, clap, hi-hat, and percussion events.",
  "four-on-the-floor kick": "A kick drum placed on every quarter-note beat in 4/4, creating the continuous pulse fundamental to disco, house, techno, and many related dance styles.",
  "broken breakbeats": "Syncopated drum patterns derived from or resembling sampled breaks, with kicks and snares displaced from a steady four-on-the-floor grid to create fractured rhythmic motion.",
  "2-step garage drums": "A swung UK-garage pattern in which the kick skips expected quarter-note positions while snares or claps anchor the backbeat, supported by shuffled hats and syncopated percussion.",
  "Amen-style breaks": "Chopped, rearranged, or stylistically modeled breakbeats based on the famous drum solo from the Winstons' 1969 recording “Amen, Brother,” especially its syncopated kick-snare phrasing used throughout jungle and drum & bass.",
  "half-time drums": "A groove that makes the pulse feel roughly half as fast by placing the primary backbeat less frequently—commonly a strong snare on beat three of a 4/4 bar—while subdivisions may continue at normal speed.",
  "shuffle groove": "A rhythmic feel in which equal subdivisions are replaced by uneven long-short groupings, often approximating the first and third notes of a triplet.",
  "syncopated unison hits": "Accented notes struck simultaneously by multiple instruments on offbeats, anticipated beats, or other metrically unexpected positions, turning ensemble attacks into a rhythmic device.",
  "rolling percussion": "Continuous or densely interlocking percussion patterns that maintain forward motion through repeated subdivisions, layered accents, and small variations rather than isolated hits.",
  "polyrhythmic percussion": "Percussion layers that articulate two or more contrasting rhythmic groupings or cycles at the same time, creating overlapping metric or subdivision relationships.",
  "motorik pulse": "A steady, driving beat associated with Krautrock, commonly in 4/4 with an even kick-and-snare feel and little swing.",
  "punk backbeat": "A fast, forceful rock beat centered on snare accents on beats two and four, energetic hi-hat or cymbal subdivision, and direct kick-drum support.",
  "tribal percussion": "Layered, cyclical percussion intended to evoke communal or ritualized ensemble drumming through repeated tom, hand-drum, shaker, or auxiliary-percussion patterns; the term describes a production aesthetic rather than a single musical tradition.",
  "sub-bass pulse": "A repeating low-frequency tone or bass hit whose recurrence functions as both a physical low-end event and a rhythmic anchor.",
  "sidechained kick-and-bass movement": "Audible interaction created when kick-triggered dynamics processing reduces the bass or another sustained element, producing rhythmic ducking and a recurring swell after each kick.",
  "slow breakbeats": "Breakbeat-style drum patterns presented at a lower tempo or with a laid-back pulse, retaining syncopated kick-snare interplay without the rapid pace of jungle or drum & bass.",
  "IDM-derived beats": "Programmed electronic rhythms influenced by experimental 1990s-and-later IDM, often using intricate edits, irregular accents, unusual timbres, microvariation, and structures not limited to straightforward dance-floor repetition.",
  "sustained drones": "Long, continuously sounding pitches or dense tone clusters that change little over time, creating a stable harmonic field, tension bed, or immersive texture.",
  "ambient field recordings": "Recorded environmental sound—such as streets, rooms, weather, nature, crowds, or machinery—used primarily to establish place, atmosphere, depth, or documentary texture.",
  "vinyl texture": "Surface noise, crackle, hiss, mechanical rumble, pitch instability, or filtered spectral character associated with vinyl playback and often used to suggest age, intimacy, or sampled-media provenance.",
  "tape hiss": "Broadband noise produced by analog magnetic tape, used either as an unavoidable recording artifact or deliberately as a soft continuous layer that adds vintage texture and perceived cohesion.",
  "noise beds": "Continuous layers of broadband, filtered, mechanical, electrical, or environmental noise placed beneath musical material to add density, tension, atmosphere, or spectral motion.",
  "reversed textures": "Audio played or processed backward so attacks become swells, decays lead into transients, and familiar sounds acquire unnatural envelopes and directional motion.",
  "granular clouds": "Diffuse textures created by splitting audio into very short grains and layering, scattering, stretching, or repositioning them to form evolving masses of sound.",
  "sampled dialogue": "Spoken words taken from an existing recording and incorporated as rhythmic, narrative, atmospheric, or structural material.",
  "found sound": "Recorded real-world sound used as musical material, such as environmental noise, machinery, speech, room tone, or incidental events.",
  "reverberant ambience": "A spatial texture in which reflected sound and long decays are prominent enough to create a strong sense of room size, distance, haze, or environmental depth.",
  "swelling feedback": "Feedback shaped to rise gradually in level or brightness, turning unstable amplified resonance into crescendos, transitions, drones, or waves of tension.",
  "orchestral pads": "Sustained ensemble-like layers—real, sampled, or synthesized—modeled on strings, brass, winds, or blended orchestra to provide harmonic breadth and cinematic depth.",
  "string swells": "Bowed-string notes or chords shaped with gradual crescendos, often entering softly and expanding in volume to create lift, tension, or transition.",
  "choir layers": "Multiple sung or synthesized vocal parts blended into sustained chordal or textural masses, adding harmonic width, human resonance, or ceremonial scale.",
  "dub echoes": "Rhythmic repeats derived from dub production practice, commonly using delay feedback, filtering, send automation, and spatial manipulation so fragments recur and decay through the mix.",
  "noir-jazz textures": "Dark, cinematic jazz coloration built from restrained or smoky instrumental timbres, minor or chromatic harmony, sparse space, and an atmosphere associated with film-noir scoring.",
  "spy-soundtrack gestures": "Musical cues associated with espionage scoring, such as tense chromatic motifs, muted or staccato figures, dramatic brass or strings, surf-influenced guitar, and suspense-oriented harmonic turns.",
  "hypnotic samples": "Repeated sampled fragments whose looping, subtle variation, timbral character, or rhythmic placement creates sustained attention and trance-like continuity.",
  "cinematic sample collage": "A layered construction of sampled speech, music, ambience, effects, and found recordings arranged to suggest scenes, narrative movement, montage, or film-like atmosphere.",
  "close-miked vocals": "Vocals recorded with the microphone positioned near the singer, emphasizing direct sound, breath, mouth detail, proximity effect, and an intimate sense of closeness.",
  "layered vocal harmonies": "Multiple vocal parts or overdubs sounding different chord tones or melodic intervals together, increasing harmonic richness, width, and ensemble scale.",
  "spoken-word passages": "Sections delivered primarily as speech rather than sustained singing or rap melody, allowing prose, narration, recitation, or conversational rhythm to become part of the composition.",
  "whispered vocals": "Vocal delivery dominated by breath and unvoiced articulation rather than full vocal-fold vibration, creating a quiet, intimate, fragile, or unsettling timbre.",
  "shouted vocals": "Forceful, high-intensity vocal delivery in which speech or pitch is projected with aggressive attack and reduced emphasis on smooth sustained tone.",
  "gang vocals": "A group of voices singing or shouting the same line together, often recorded in layers to create communal weight, crowd energy, or emphatic hooks.",
  "call-and-response vocals": "A vocal structure in which one phrase functions as a call and another voice, group, or contrasting phrase answers it, creating conversational or communal musical exchange.",
  "processed vocal chops": "Short vocal fragments cut from longer recordings and transformed through slicing, repitching, time-stretching, sequencing, effects, or repetition until they function as rhythmic or melodic material.",
  "breathy lead vocals": "Lead singing with a high proportion of audible airflow and soft vocal-fold closure, producing an intimate, airy, delicate, or close-up tone.",
  "detached vocal delivery": "A deliberately cool, restrained, or emotionally distanced performance style that minimizes overt dramatic inflection even when the lyric itself is intense.",
  "melodic rap phrasing": "Rap delivery in which pitch contour, sung notes, or recurring melodic shapes are integrated into speech-rhythmic flow rather than using primarily unpitched declamation."
};

const artisticDirectionDefinitions: Readonly<Record<string, string>> =
{
  "toward a more electronic sound": "Greater reliance on synthesized, sampled, sequenced, or electronically processed material, with electronic timbre becoming more central than acoustic or conventional live-band texture.",
  "toward club-oriented production": "Production shaped for dance-floor function through a clear pulse, low-end impact, repetitive phrasing, mixable transitions, and deliberate build-and-release.",
  "toward progressive house": "House arrangements that develop gradually through layered harmony, evolving texture, long transitions, and sustained tension-and-release rather than abrupt sectional changes.",
  "toward melodic techno": "Techno-centered rhythm paired with prominent melodic and harmonic development, often using arpeggiated synths, atmospheric builds, sequenced bass, and long-form repetition.",
  "toward deeper house grooves": "House rhythm that emphasizes warm or substantial bass, restrained percussion, pocket, subtle swing, and a less overtly peak-time arrangement.",
  "toward broken-beat production": "Rhythm built from syncopated or non-four-on-the-floor drum patterns, chopped breaks, displaced accents, and elastic interaction between kick, snare, percussion, and bass.",
  "toward bass-driven electronic music": "Electronic arrangements in which sub-bass, bass synthesis, or low-frequency rhythmic design carries much of the groove, physical weight, and sonic identity.",
  "toward ambient electronic soundscapes": "Electronic texture takes precedence over conventional song drive through sustained pads, drones, spatial effects, environmental detail, and gradual timbral change.",
  "toward synth-heavy arrangements": "Synthesizers assume a leading role across melody, harmony, bass, texture, or rhythm, reducing dependence on conventional acoustic instrumentation.",
  "toward sample-based production": "Recorded fragments become compositional material through looping, chopping, layering, resampling, time manipulation, or other transformation.",
  "toward a darker electronic palette": "Electronic timbre and harmony shift toward lower brightness, greater tension, heavier low end, restrained highs, minor or modal color, and more ominous spatial design.",
  "toward a more euphoric dance sound": "Dance arrangements emphasize uplift and release through bright harmony, rising builds, expansive synths, energetic drums, and emotionally heightened climaxes.",
  "toward extended electronic structures": "Longer electronic arrangements develop through accumulation, subtraction, repetition, gradual timbral change, and DJ-scale transitions rather than compact pop sections.",
  "toward a stripped-back minimal club sound": "Dance-floor production uses fewer simultaneous elements, repeated microvariation, negative space, focused low end, and precise rhythmic placement.",
  "toward live instrumentation inside electronic production": "Acoustic or amplified performance—such as drums, bass, guitar, keys, strings, or winds—is integrated with sequencing, synthesis, sampling, and electronic processing.",
  "toward synth-heavy atmospheric pop": "Pop songwriting is framed by layered synthesizers, pads, electronic bass, processed rhythm, and spacious ambience while retaining a strong melodic and song-form focus.",
  "toward heavier guitar music": "Guitars gain more distortion, low-mid weight, riff emphasis, aggressive dynamics, or lower tuning, supported by a denser and more forceful rhythm section.",
  "toward raw live-band performances": "Arrangement and recording prioritize ensemble feel, room interaction, dynamic variation, and performance imperfections over tightly edited or heavily layered studio construction.",
  "toward atmospheric alternative rock": "Alternative-rock songwriting places greater weight on ambience, sustained guitar or electronic textures, spatial effects, and mood as structural elements.",
  "toward progressive rock arrangements": "Rock arrangement expands through multi-section forms, thematic development, instrumental interplay, longer durations, and more intricate rhythmic or harmonic writing.",
  "toward psychedelic studio experimentation": "The studio becomes a creative instrument through altered timbre, tape or editing effects, modulation, feedback, spatial processing, drones, and unusual instrumental combinations.",
  "toward denser guitar textures": "Multiple guitar layers, doubled parts, distortion, sustain, feedback, or overlapping voicings create a thicker and less transparent guitar field.",
  "toward cleaner guitar arrangements": "Guitar parts use less distortion and greater note separation, emphasizing articulation, chord voicing, arpeggiation, space, and complementary interlocking lines.",
  "toward post-rock dynamics": "Rock instrumentation is shaped through repetition, texture, long crescendos, extreme dynamic contrast, and gradual development rather than hook-centered verse-and-chorus structure.",
  "toward shoegaze texture": "Dense layers of effects-heavy guitar, distortion, sustain, feedback, and reverb form a blended wash in which individual instruments and vocals may recede into the texture.",
  "toward punk immediacy": "Songs become more direct and economical through short forms, simple forceful riffs, urgent rhythm, minimal ornament, and performance-first energy.",
  "toward art-rock experimentation": "Rock conventions are deliberately expanded or disrupted through unusual form, timbre, instrumentation, conceptual framing, or avant-garde and electronic techniques.",
  "toward a more melodic rock sound": "Melody and singable contour become more prominent in riffs, vocals, hooks, chord movement, and arrangement without necessarily reducing the weight of the rock instrumentation.",
  "toward a more abrasive rock sound": "Rock texture becomes harsher and more confrontational through distortion, dissonance, aggressive transients, noisy timbre, raw vocals, or dense high-energy playing.",
  "toward longer progressive forms": "Compositions move beyond compact song length through multiple sections, recurring themes, extended instrumental passages, developmental transitions, or suite-like continuity.",
  "toward greater harmonic complexity": "Harmony uses a wider chord vocabulary or more involved relationships, including extensions, substitutions, chromaticism, modulation, modal mixture, altered dominants, or less predictable voice leading.",
  "toward more diatonic songwriting": "Melody and harmony stay more consistently within the notes and chords of a prevailing key or diatonic mode, favoring tonal clarity over chromatic departure.",
  "toward more chromatic harmony": "Harmony increasingly uses pitches or chords outside the prevailing key, including borrowed chords, secondary functions, altered tones, or chromatic voice leading.",
  "toward modal writing": "Melodic and harmonic organization centers on a mode such as Dorian, Mixolydian, Lydian, or Phrygian rather than conventional major-or-minor function alone.",
  "toward odd-meter composition": "Phrases or sections are organized in asymmetrical or changing meters—such as 5/4, 7/8, or mixed meter—so irregular beat grouping becomes a compositional feature.",
  "toward more conventional song structures": "Form moves toward familiar repeated sections such as verse, chorus, pre-chorus, bridge, or AABA, with clearer sectional recurrence and listener orientation.",
  "toward through-composed forms": "Music develops continuously with little or no large-scale repetition of complete sections, allowing the form to follow evolving musical or narrative material.",
  "toward motif-driven composition": "A short recognizable musical idea becomes a structural seed, recurring and changing through repetition, transposition, fragmentation, inversion, rhythmic alteration, or reharmonization.",
  "toward extended instrumental development": "Instrumental material receives more time to evolve through solos, interludes, thematic transformation, texture changes, or gradual ensemble development.",
  "toward more concise songwriting": "Songs use fewer or shorter sections, quicker arrivals at core material, reduced repetition, and tighter arrangement choices while preserving the central musical idea.",
  "toward narrative songwriting": "Lyrics and form increasingly carry a story through characters, events, perspective, temporal progression, or changing scenes rather than static emotional description alone.",
  "toward instrumental composition": "Musical argument shifts away from lyric-led writing toward melody, harmony, rhythm, timbre, texture, orchestration, and instrumental development as the principal carriers of form and meaning.",
  "toward more spacious arrangements": "Arrangement creates more negative space between parts, lower simultaneous density, longer decays, wider perceived depth, or more room for individual elements to breathe.",
  "toward a more intimate sound": "Production reduces perceived distance and scale through close or exposed performance, restrained arrangement, detailed dynamics, and a sense of proximity to the listener.",
  "toward a more cinematic sound": "Arrangement emphasizes scene-setting, dramatic pacing, thematic recurrence, orchestral or electronic color, dynamic arcs, and spatial depth suggestive of music supporting imagery or narrative.",
  "toward a more organic palette": "Timbre shifts toward acoustic, electroacoustic, human-played, room-recorded, or naturally irregular sources rather than predominantly synthetic or heavily quantized material.",
  "toward a more synthetic palette": "Timbre relies more strongly on synthesis, electronic drums, processed or resampled sound, digital modulation, and deliberately artificial or machine-like sources.",
  "toward a nocturnal atmosphere": "Sound evokes nighttime through subdued or dark timbre, sparse space, low-light ambience, intimate scale, restrained energy, or urban and after-hours associations.",
  "toward a brighter melodic palette": "Melody and harmony move toward clearer or higher-register timbres, consonant or major-leaning color, buoyant contour, and arrangements that foreground luminosity and lift.",
  "toward a darker atmosphere": "Harmony, timbre, register, dynamics, and space emphasize tension, shadow, ambiguity, weight, or foreboding rather than brightness and openness.",
  "toward greater rhythmic emphasis": "Groove, pulse, syncopation, percussion, bass-rhythm interaction, accent patterns, or metric design become more structurally prominent.",
  "toward more spontaneous performances": "Performance leaves more room for improvisation, live interaction, timing variation, reactive dynamics, and takes that preserve unplanned musical decisions.",
  "toward tighter studio precision": "Production favors controlled timing, deliberate editing, consistent articulation, repeatable layering, detailed automation, and carefully managed balance over loose ensemble variance.",
  "toward lo-fi immediacy": "Recording retains audible roughness, limited fidelity, room or device coloration, saturation, noise, or minimally polished performance in exchange for directness and character."
};

const rhythmDefinitions: Readonly<Record<string, string>> =
{
  "common time": "The familiar 4/4 meter, usually felt as four quarter-note beats per bar and used widely across rock, pop, electronic and dance music.",
  "cut time": "2/2 meter, often felt as two strong half-note beats per bar, creating a brisk marching, punk, or fast-swing feel.",
  "triple meter": "Meter organized in groups of three beats per bar, such as 3/4, often producing a waltz-like or circular motion.",
  "compound meter": "Meter whose beat divides naturally into three smaller pulses, as in 6/8, 9/8 or 12/8, producing a rolling or lilting feel.",
  "6/8 feel": "A compound duple feel with two main beats per bar, each subdividing into three eighth notes for a swaying, rolling motion.",
  "12/8 feel": "A compound quadruple feel often heard as four large beats divided into triplets, common in blues, soul and slow rock grooves.",
  "odd meter": "Meter using asymmetrical beat counts such as 5/4, 7/8 or 11/8, often creating tension, angularity or progressive complexity.",
  "mixed meter": "A metrical design that alternates between different time signatures or beat groupings, reshaping the pulse from bar to bar.",
  "changing meter": "Regular or irregular shifts between meters during a piece or section, making the bar structure itself part of the musical drama.",
  "additive meter": "Meter built by combining unequal beat groupings such as 2+3 or 3+2+2, common in Balkan-influenced, progressive and modernist rhythms.",
  "straight eighth-note pulse": "An even subdivision in which eighth notes are played equally rather than swung, giving the groove a clean, direct pulse.",
  "straight sixteenth-note pulse": "A tightly gridded feel based on even sixteenth-note subdivision, common in funk, electronic and precision-driven rhythms.",
  "backbeat": "Accenting beats two and four in common time, a foundational rock, pop, R&B and dance-music device.",
  "half-time feel": "A groove that makes the pulse feel slower by placing the snare or main accents at half the expected rate, often widening the space of the beat.",
  "double-time feel": "A groove that makes the pulse feel faster by intensifying subdivision or accent activity, even when the underlying tempo stays the same.",
  "shuffle": "A lopsided subdivision, often long-short within a triplet framework, that gives the beat a bouncing blues or boogie feel.",
  "swing": "A flexible long-short subdivision and accent practice central to jazz and many groove traditions, creating forward motion and lift.",
  "triplet groove": "A groove whose surface rhythm is strongly organized around triplet subdivision rather than even eighths or sixteenths.",
  "motorik pulse": "A steady, driving beat associated with Krautrock, commonly in 4/4 with an even kick-and-snare feel and little swing.",
  "punk drive": "A fast, insistent rhythmic attack built on urgent straight subdivision, hard backbeats and relentless forward motion.",
  "laid-back pocket": "A groove in which players place attacks slightly behind the center of the beat, creating relaxation without losing time.",
  "behind-the-beat feel": "Intentional placement of notes just after the metrical center, giving the performance a relaxed, dragging or deep-pocket character.",
  "on-top-of-the-beat feel": "Intentional placement of notes slightly ahead of the beat center, making the performance feel urgent, bright or pressing.",
  "syncopated pocket": "A groove whose strongest rhythmic identity comes from accents or attacks falling off the main beats while the pulse remains clear.",
  "four-on-the-floor rhythm": "A dance groove with the kick drum sounding on every quarter note of 4/4, central to disco, house and related club music.",
  "broken-beat rhythm": "A groove that avoids steady four-on-the-floor regularity by using fragmented, off-center drum programming and syncopated accents.",
  "2-step garage rhythm": "A UK garage groove that disrupts straightforward house kick placement, often leaving space on downbeats while using syncopated snares and shuffling hi-hats.",
  "Amen break": "The famous drum break from The Winstons’ 1969 recording Amen, Brother, heavily sampled and reshaped in hip-hop, jungle and drum & bass.",
  "rolling drum-and-bass rhythm": "A fast breakbeat groove with continuous sixteenth-note energy, syncopated snare placement and flowing low-end propulsion.",
  "half-time bass rhythm": "A bass-music groove that combines a slower-feeling half-time snare placement with heavy low-frequency emphasis and dense subdivision.",
  "tribal house percussion": "A house groove colored by layered hand drums, toms or percussion patterns that evoke a communal, polyrhythmic dance feel.",
  "syncopated house groove": "A house rhythm that keeps the club pulse stable while adding offbeat chord stabs, bass syncopation and percussion interplay.",
  "driving techno pulse": "A firm, repetitive machine groove built for sustained momentum, usually with steady kick, sequenced percussion and minimal swing.",
  "hypnotic techno loop": "A techno groove built from tightly repeating cells and subtle timbral or rhythmic change, encouraging trance-like focus.",
  "progressive-house pulse": "A house groove designed for long-form build and release, using steady pulse, gradual layering and evolving rhythmic detail.",
  "offbeat bass rhythm": "A bass pattern emphasizing the offbeats between kick-drum pulses, especially common in house, trance and related dance styles.",
  "syncopation": "The deliberate emphasis of weak beats, offbeats or unexpected subdivisions against an otherwise stable pulse.",
  "polyrhythm": "The simultaneous use of contrasting rhythmic patterns or beat divisions, such as three against two, within the same temporal space.",
  "polymeter": "The simultaneous layering of different meters, so that parts may share tempo while articulating different bar lengths.",
  "cross-rhythm": "A conflicting rhythmic pattern set against the main meter, often creating tension through ratios such as three against two.",
  "hemiola": "A temporary reinterpretation of rhythmic grouping, often making two groups of three feel like three groups of two or vice versa.",
  "metric displacement": "The shifting of a pattern to a new position within the bar so the material stays recognizable while accents fall in new places.",
  "rhythmic displacement": "Moving a motif or attack pattern earlier or later in time relative to the beat, changing perception without changing its intervallic identity.",
  "metric modulation": "A tempo reinterpretation in which one note value or subdivision becomes the new beat unit, linking old and new pulse relationships.",
  "rhythmic augmentation": "The lengthening of a rhythmic idea’s note values so the pattern unfolds more slowly while preserving its proportional shape.",
  "rhythmic diminution": "The shortening of a rhythmic idea’s note values so the pattern unfolds more quickly while preserving its proportional shape.",
  "nested tuplets": "Tuplets placed inside other tuplets or unusually layered subdivisions, creating highly specific or intricate beat division.",
  "irregular phrase lengths": "Phrases that avoid symmetrical four- or eight-bar expectations, often extending, truncating or offsetting formal cadence points.",
  "syncopated unison riffs": "Ensemble riffs played together with tightly aligned attacks whose identity depends on offbeat accent placement and rhythmic precision."
};

const releaseContextDefinitions: Readonly<Record<string, string>> =
{
  "debut release": "A first official release that introduces the artist’s public voice, identity and early priorities.",
  "early recording effort": "Material captured during an initial stage of recording experience, often before the artist’s methods have fully stabilized.",
  "first sustained songwriting effort": "A project representing the artist’s first extended attempt to write and shape songs as a coherent body of work.",
  "breakthrough release": "A release that marks a decisive leap in profile, artistic confidence, execution or audience reach.",
  "sophomore release": "The second major release in a sequence, often testing whether the project expands or consolidates its initial identity.",
  "mature-period release": "Work from a more developed stage of the artist’s career, showing established craft and a clearer long-view perspective.",
  "late-career release": "A release shaped by a later career phase, often reflecting hindsight, refinement or a broadened artistic frame.",
  "return after a hiatus": "A project created after a significant break in recording or releasing activity, often carrying a sense of re-entry or reassessment.",
  "side project": "A release made outside the artist’s principal outlet, often allowing alternate collaborators, methods or stylistic priorities.",
  "solo debut": "The artist’s first release under an individual name rather than a band or collaborative identity.",
  "collaborative release": "A project meaningfully shaped by joint authorship, shared performance or a combined artistic identity.",
  "stylistic transition": "A release that documents movement from one established sound, method or scene vocabulary toward another.",
  "creative reset": "A project framed by deliberate simplification, reorientation or clearing away of earlier habits in order to start fresh.",
  "expansion of an established sound": "A release that retains core identity while widening palette, structure, production or expressive range.",
  "return to earlier influences": "A project that reconnects with stylistic sources, references or habits that were central at an earlier stage.",
  "move toward heavier material": "A shift toward denser timbre, stronger impact, darker weight or more forceful rhythmic and harmonic language.",
  "move toward electronic production": "A transition toward drum programming, synthesis, sequencing or other electronically centered production methods.",
  "move toward live instrumentation": "A renewed emphasis on performed instruments, room interaction and ensemble capture over purely programmed construction.",
  "move toward more intimate songwriting": "A turn toward closer, more personal or emotionally exposed lyrical and compositional expression.",
  "move toward more experimental structures": "A shift toward nonstandard forms, extended development or less conventional organization.",
  "move toward greater compositional complexity": "A move toward richer structure, more intricate arrangement or heightened rhythmic, harmonic or formal detail.",
  "home-studio recording period": "Material primarily created in a home-studio environment, often marked by autonomy, intimacy and resourceful production choices.",
  "live-room recording period": "Work tracked in a shared room environment where acoustic interaction and ensemble bleed become part of the sound.",
  "late-night recording sessions": "Material shaped by sessions carried out late at night, often associated with isolation, loosened inhibition or nocturnal atmosphere.",
  "remote collaboration": "A project assembled across distance, with contributors recording or exchanging parts from separate locations.",
  "self-produced release": "A release produced by the artist rather than by an outside producer, usually indicating higher direct control over sonic decisions.",
  "band-produced release": "A project whose production choices were shaped collectively by the band rather than by a single external producer.",
  "studio experimentation period": "Work created during a phase of exploratory recording, sound design or process-driven trial and error.",
  "improvisation-led sessions": "Sessions in which spontaneous performance and discovery played a major role in generating the final material.",
  "demo-stage recordings": "Recordings captured at a demo phase, often prioritizing song blueprint, immediacy or working arrangement over final polish.",
  "archival recordings": "Previously recorded material preserved and presented later as part of the historical record of a project.",
  "demo collection": "A gathered set of demo recordings presented together to document formative versions or work-in-progress stages.",
  "archival release": "A release assembled chiefly from historical or previously unissued material rather than from a new studio cycle.",
  "alternate versions": "Material presenting alternate takes, mixes, edits or arrangements of known pieces.",
  "unfinished recordings": "Recordings left incomplete in writing, performance, arrangement or production, yet issued for their documentary or artistic value.",
  "early arrangements": "Versions from an earlier arranging stage, showing how songs or pieces sounded before their later final form.",
  "pre-production recordings": "Recordings made before formal final tracking, often used to test structure, tempo, arrangement or sonic approach.",
  "live session document": "A release functioning as a document of a particular live session, broadcast, capture or in-room performance event.",
  "rehearsal recordings": "Material drawn from rehearsal environments, emphasizing process, preparation and working performance state.",
  "previously unreleased material": "Recordings completed or preserved earlier but not issued until the present release."
};

const coreIdentityDefinitions: Readonly<Record<string, string>> =
{
  "emotionally direct songwriting": "Songwriting that states or embodies feeling plainly and immediately rather than hiding it behind elaborate abstraction.",
  "melodic songwriting": "Songwriting whose identity depends strongly on memorable, singable melodic contour and phrase shape.",
  "lyrical introspection": "Lyrics focused on inward examination of thought, feeling, memory, motive or self-understanding.",
  "narrative songwriting": "Songwriting organized around characters, events, perspective or a developing story rather than purely impressionistic expression.",
  "melody over complexity": "An artistic priority that favors memorable melodic communication over overt technical complication.",
  "hooks inside experimental arrangements": "A musical identity that embeds memorable hooks within forms, textures or structures that are otherwise exploratory.",
  "vulnerability framed by strong melodies": "A combination of emotional exposure and melodic confidence, where fragile feeling is carried by clearly shaped tuneful lines.",
  "tension between melody and distortion": "A core identity built on the friction between clear melodic writing and abrasive, degraded or overdriven sonics.",
  "raw live-band immediacy": "An identity centered on the charged, imperfect, in-the-room impact of a band sounding present and unfiltered.",
  "dense guitar textures": "A signature reliance on layered, interlocking or heavily processed guitar parts to create atmosphere and weight.",
  "contrast between vulnerability and aggression": "An identity that juxtaposes tenderness, openness or fragility with force, attack or confrontational intensity.",
  "riff-driven songwriting with atmospheric detail": "Music led by strong repeating riff ideas while also investing heavily in space, tone and surrounding texture.",
  "progressive complexity without losing hooks": "A balance between technical or formal ambition and the retention of memorable, accessible musical anchors.",
  "psychedelic texture anchored by songcraft": "A sound that explores altered or immersive timbres while remaining grounded in deliberate songwriting shape.",
  "punk energy inside carefully arranged songs": "A mixture of urgency and edge with arrangements that are more considered than purely reckless or raw.",
  "tension between acoustic and electronic sound": "A core identity shaped by the interplay of organic instruments and synthetic or programmed materials.",
  "mechanical rhythm with human emotion": "Music that pairs machine-like pulse or repetition with emotionally resonant melody, harmony or performance.",
  "melodic electronic production": "Electronic production whose main appeal lies not only in texture or groove but in clearly shaped melodic ideas.",
  "extended electronic development": "An identity that values gradual evolution, long-form layering and sustained electronic build rather than quick payoff alone.",
  "deep grooves and atmospheric soundscapes": "A combination of danceable rhythmic depth with spacious, immersive or environmental texture.",
  "club rhythm with introspective songwriting": "Music that draws on dance-floor pulse while keeping lyrical or emotional focus inward and reflective.",
  "organic instrumentation inside electronic production": "A blend in which live or acoustic instruments remain central even within an electronically shaped production world.",
  "synthetic texture around conventional song forms": "Electronic or synthesized sonics wrapped around familiar verse, chorus or pop-song organization.",
  "synth-heavy atmospheric songwriting": "Songwriting in which synthesizers play a major role in building mood, space and emotional color.",
  "texture over virtuosity": "An artistic stance that values sonority, feel and timbral experience more than overt display of technical skill.",
  "atmosphere over spectacle": "An identity focused on mood, immersion and internal depth rather than flashy display or maximal showmanship.",
  "repetition with subtle variation": "A style that builds meaning by reiterating material while changing detail gradually over time.",
  "harmonic ambiguity as an expressive device": "An identity that uses uncertain tonal center or unstable harmonic meaning to generate tension, color or emotional openness.",
  "formal experimentation grounded by melody": "Willingness to stretch form and structure while keeping melody as the listener’s anchor.",
  "cinematic atmosphere": "A sound world whose scale, pacing or texture suggests the immersive framing of film music or visual scenes.",
  "nocturnal tension": "A dark, late-night atmosphere combining unease, intimacy and restrained pressure.",
  "carefully controlled contrast": "A musical identity built on precise balancing of opposites such as loud and soft, raw and polished, or intimate and expansive."
};

const performanceDefinitions: Readonly<Record<string, string>> =
{
  "spontaneous performance": "Performance that feels discovered in the moment rather than excessively scripted or over-rehearsed.",
  "live-band performance": "An approach shaped by multiple players interacting in real time rather than by isolated or purely assembled parts.",
  "live-off-the-floor feel": "A feeling that the performance was captured together in a single pass or near-live setup, preserving ensemble interaction and bleed.",
  "live-wire performance": "A performance quality marked by volatility, charge and a sense that things could leap or break open at any moment.",
  "loose ensemble feel": "Group playing that allows slight looseness and human give rather than aiming for rigid machine-perfect alignment.",
  "improvisational performance": "Performance in which significant musical decisions are made in real time through spontaneous invention.",
  "visceral performance": "Delivery that lands bodily and immediately, emphasizing instinct, force and physical impact.",
  "immediate performance": "A presentation that feels direct, unbuffered and emotionally present, with little sense of distance or delay.",
  "room-energy performance": "Performance shaped by the audible energy of players sharing a room, including response, bleed and collective momentum.",
  "communal performance": "Performance that feels collective and shared rather than centered solely on isolated individual display.",
  "reckless performance": "Playing or delivery that embraces risk, instability or edge instead of careful restraint.",
  "tight ensemble playing": "Group execution with highly coordinated timing, attacks and transitions among players.",
  "precision-driven performance": "A performance approach that prioritizes exactness, consistency and technical control.",
  "tightly controlled performance": "Execution shaped by deliberate restraint, measured dynamics and carefully managed expression.",
  "virtuosic interplay": "Interaction among performers that foregrounds advanced skill, quick responsiveness and intricate exchange.",
  "technical instrumental performance": "Instrumental playing defined by strong command of technique, accuracy and demanding material.",
  "metronomic precision": "Timekeeping so steady that it approximates the consistency of a metronome or sequencer.",
  "locked-in rhythm section": "Bass, drums and related pulse instruments working with exceptionally unified timing and groove.",
  "synchronized unison playing": "Multiple performers articulating the same material together with highly matched timing and attack.",
  "restrained delivery": "Vocal or instrumental expression held in check, avoiding excess while retaining focus and intention.",
  "aggressive delivery": "A delivery style marked by force, attack, pressure or confrontational emphasis.",
  "breathy delivery": "A vocal delivery colored by audible breath and softened edge, often creating intimacy or fragility.",
  "whispered delivery": "Extremely soft vocal delivery with minimal projection, often used for secrecy, closeness or tension.",
  "shouted delivery": "Raised, forceful vocal delivery that emphasizes urgency, release or confrontation.",
  "deadpan delivery": "Expression intentionally flattened or emotionally withheld, often creating irony, detachment or understated tension.",
  "conversational delivery": "A delivery style shaped by the cadences of speech rather than overt theatrical stylization.",
  "melismatic delivery": "Vocal delivery that extends a syllable across multiple pitches, drawing attention to fluid ornament and line.",
  "spoken-word delivery": "Text delivered primarily as speech rhythm rather than sustained sung melody.",
  "theatrical delivery": "Delivery heightened for dramatic effect, often with stylized phrasing, character emphasis or overt staging energy.",
  "manic delivery": "A rapid, intense, unstable or overcharged delivery that suggests agitation or racing momentum.",
  "intimate delivery": "Delivery that feels close, personal and directed almost one-to-one rather than outwardly projected.",
  "instrumental call and response": "Performers answering one another with alternating phrases, creating dialogue inside the arrangement.",
  "contrapuntal interplay": "Simultaneous independent lines interacting with one another while retaining distinct melodic identity.",
  "rhythmic unison": "Ensemble interplay defined by tightly shared rhythmic figures even when pitch content may differ.",
  "solo-and-accompaniment contrast": "A performance relationship that highlights the distinction between foreground lead material and supportive backing roles.",
  "improvised ensemble interaction": "Collective interplay shaped in real time through mutual listening and spontaneous adjustment.",
  "layered ensemble interaction": "Ensemble performance organized through multiple overlapping parts that interlock rather than simply doubling one another.",
  "drums-and-bass lock": "A rhythm-section relationship in which drums and bass connect with exceptional precision, weight and shared groove logic."
};

const songwritingDefinitions: Readonly<Record<string, string>> =
{
  "verse-chorus songwriting": "Songwriting organized around contrasting verses and a recurring chorus that functions as the main return point.",
  "verse-refrain songwriting": "A song form in which verses cycle with a repeated refrain, typically shorter and less contrasting than a full chorus.",
  "AABA songwriting": "A classic song form built from two similar opening sections, a contrasting bridge and a return to the opening material.",
  "strophic songwriting": "A structure in which successive verses are sung to essentially the same music.",
  "through-composed songwriting": "Songwriting that continues developing new material rather than cycling primarily through repeating verse-chorus sections.",
  "riff-driven songwriting": "Songs whose structure and identity are led chiefly by recurring riff material.",
  "hook-driven songwriting": "Writing designed around memorable, repeatable gestures that quickly catch the listener’s attention.",
  "groove-driven songwriting": "Songs built from the pull of rhythm and feel, with groove acting as the main organizing force.",
  "melody-first songwriting": "An approach that starts from tune and phrase contour, with other musical layers serving the melodic line.",
  "rhythm-first songwriting": "An approach that begins from beat, groove or rhythmic pattern, with melody and harmony growing from that foundation.",
  "motif-driven composition": "Composition organized around a short recurring idea that is repeated, varied and developed across the piece.",
  "repetition with gradual development": "A process in which material returns many times while small changes accumulate to create motion and form.",
  "thematic development": "The unfolding and transformation of a theme or central musical idea over time.",
  "thematic reprise": "The return of an earlier musical theme, motif, lyric or section later in a piece to create continuity or transformation.",
  "extended instrumental development": "A writing approach that gives substantial time to evolving instrumental sections beyond brief accompaniment roles.",
  "multi-part suite writing": "Composition divided into multiple connected sections or movements that form a larger whole.",
  "episodic structure": "A form that moves through discrete sections or scenes rather than relying on one dominant repeating cycle.",
  "cyclical structure": "A structure that returns to earlier material in a deliberate cycle, often giving the whole piece a circular sense.",
  "long-form progressive development": "A compositional design that unfolds gradually across an extended span, often with accumulating transformation.",
  "build-and-release structure": "A form that intensifies tension through layering or ascent and then resolves or drops into release.",
  "minimalist process writing": "Writing based on repetition, small shifts and gradual process rather than constant sectional contrast.",
  "emotionally direct songwriting": "Songwriting that states or embodies feeling plainly and immediately rather than hiding it behind elaborate abstraction.",
  "lyrical introspection": "Lyrics focused on inward examination of thought, feeling, memory, motive or self-understanding.",
  "confessional writing": "Lyrics that disclose private feeling, vulnerability or personal history with unusual openness.",
  "narrative songwriting": "Songwriting organized around characters, events, perspective or a developing story rather than purely abstract expression.",
  "character-driven storytelling": "Writing that foregrounds the psychology, voice or actions of a particular persona or dramatic figure.",
  "observational writing": "Lyrics that describe scenes, people or events from a watching or noticing stance rather than an intensely confessional one.",
  "stream-of-consciousness lyrics": "Text that follows associative thought flow, jumps and mental immediacy more than neat linear argument.",
  "fragmentary lyrics": "Lyrics built from partial images, broken statements or deliberately incomplete thoughts.",
  "abstract lyrics": "Language that suggests mood, image or concept without always resolving into explicit narrative meaning.",
  "social commentary": "Writing that addresses social conditions, politics, institutions or collective behavior.",
  "dark humor": "Humor that draws on morbidity, discomfort, cynicism or taboo subject matter.",
  "conversational lyricism": "Lyrics shaped by speech-like phrasing and the apparent natural cadence of conversation.",
  "contrapuntal ensemble writing": "Ensemble composition built from multiple independent lines interacting simultaneously.",
  "interlocking parts": "Writing in which separate parts fit together rhythmically or melodically to create the total pattern.",
  "call-and-response arrangement": "An arrangement based on alternation between lead and answering parts.",
  "dynamic sectional contrast": "Writing that deliberately sets sections apart through strong differences in volume, density or intensity.",
  "orchestral arrangement": "Arrangement drawing on broad color layering, section-style thinking or expanded instrumental voicing associated with orchestral practice.",
  "layered ensemble writing": "Composition that gains richness through stacked, differentiated ensemble parts rather than a single exposed line.",
  "instrumental composition": "Writing that communicates without sung text, placing structure and expression primarily in instrumental material.",
  "improvisation-led composition": "Composed material derived significantly from improvisatory discovery rather than from fully preplanned writing alone.",
  "tight unison writing": "Writing that depends on multiple instruments articulating the same line with precision and impact."
};

const sonicQualityDefinitions: Readonly<Record<string, string>> =
{
  "dense": "Packed with a high amount of musical or timbral information, leaving relatively little empty space.",
  "layered": "Built from multiple audible layers whose interaction contributes strongly to the final texture.",
  "maximal": "Intentionally abundant, full and high-impact rather than stripped down or restrained.",
  "sparse": "Using relatively few events or layers, so that silence and negative space remain prominent.",
  "skeletal": "Reduced to bare structural essentials, with little decorative or filling material.",
  "minimal": "Deliberately economical in material, often emphasizing repetition, clarity and reduced means.",
  "cluttered": "So full of overlapping elements that space, clarity or separation become limited.",
  "open": "Leaving audible room around parts, so the texture breathes and components remain distinct.",
  "thick": "Full-bodied and weighty, often because of stacked frequencies, doubled parts or heavy sustain.",
  "weighty": "Conveying mass, low-end pressure or a serious, grounded physical presence.",
  "bone-crunching": "Exceptionally heavy and punishing in impact, especially in low end, attack or overall force.",
  "colossal": "Suggesting very large perceived scale, power or breadth in the sound image.",
  "spacious": "Giving a strong sense of room, depth or open air around the musical events.",
  "cavernous": "Extremely deep or echoing in perceived space, as if sounding inside a large chamber.",
  "wide": "Spread broadly across the stereo field or perceived soundstage.",
  "narrow": "Concentrated toward the center or presented with limited stereo spread.",
  "intimate": "Close, personal and small-scale in perspective, as if the sound is happening near the listener.",
  "close": "Captured or presented with very little apparent distance between source and listener.",
  "distant": "Heard as if set back from the listener, often through room ambience, reverb or softened attack.",
  "immersive": "Surrounding the listener so fully that the soundfield feels absorbing and enveloping.",
  "three-dimensional": "Conveying strong depth, width and front-to-back placement rather than a flat image.",
  "panoramic": "Broad and sweeping in spatial impression, often with wide placement and scenic scale.",
  "claustrophobic": "Conveying confinement, pressure, restricted space or a feeling that there is too little room to escape.",
  "hazy": "Softened or blurred at the edges, as though details are diffused through mist.",
  "smeared": "Blended or blurred in a way that reduces the sharp boundary between events.",
  "crystalline": "Exceptionally clear, bright and sharply defined in detail.",
  "grainy": "Marked by audible particulate roughness or textural granulation rather than smooth polish.",
  "saturated": "Richly filled with harmonic color or signal intensity, often through tape, analog or distortion-like thickening.",
  "washed-out": "Paled, bleached or softened in impact, as though color and contrast have been reduced.",
  "metallic": "Bearing a bright, hard, ringing or reflective quality reminiscent of metal.",
  "organic": "Natural, human or less overtly synthetic in feel, often suggesting acoustic source or irregular life.",
  "synthetic": "Clearly shaped by electronic generation, processing or artificial timbral design.",
  "tactile": "So concrete in texture that the sound seems almost touchable or materially present.",
  "glossy": "Smooth, polished and finished with a sleek surface sheen.",
  "dusty": "Dry, aged or slightly muffled in a way that suggests wear, air or vintage residue.",
  "velvety": "Smooth, soft and rich, especially in upper-mid and high-frequency feel.",
  "brittle": "Hard and fragile-sounding, often with thinness or breakable edge in the upper range.",
  "fuzzy": "Blurred or softened by diffuse distortion, hair-like overtones or low-definition edges.",
  "glassy": "Clear, bright and smooth with a hard reflective sheen.",
  "smoky": "Darkened, veiled or softly clouded, often with muted brightness and atmospheric blur.",
  "murky": "Obscured, dark or muddy enough that detail and separation are harder to discern.",
  "liquid": "Flowing, smooth and fluid in contour rather than sharply edged or percussive.",
  "wiry": "Lean, taut and tensile in tone, with a narrow, stringy or electric edge.",
  "angular": "Marked by sharp turns, pointed edges or abrupt contour rather than rounded smoothness.",
  "sludgy": "Heavy, thick and slow-moving, often with muddy low-mid mass and dragging force.",
  "searing": "Intensely hot, piercing or cutting in brightness, distortion or emotional force.",
  "ghostly": "Pale, spectral or eerily present, as though partly there and partly absent.",
  "serrated": "Jagged and cutting, with sharply notched or saw-like edge.",
  "breezy": "Light, easy and open in feel, without much heaviness or pressure.",
  "abrasive": "Harsh, rough, cutting or confrontational in texture, tone or expressive attitude.",
  "raw": "Unsmoothed, immediate and minimally disguised in its edges or imperfections.",
  "polished": "Refined, controlled and carefully finished in balance, detail and surface quality.",
  "rough-edged": "Retaining audible irregularities, grit or unfinished contour rather than total smoothness.",
  "clean": "Clear and relatively free of distortion, clutter or noise.",
  "lo-fi": "Marked by audible limitations or deliberate roughness such as hiss, distortion, restricted bandwidth or home-recorded texture.",
  "hi-fi": "High-fidelity in clarity, bandwidth and detail, with a relatively full and precise presentation.",
  "imperfect": "Leaving small flaws, looseness or asymmetry audible rather than correcting everything away.",
  "precise": "Sharply controlled and exact in timing, articulation, placement or sonic detail.",
  "controlled": "Carefully managed in dynamics, texture and presentation rather than wildly uncontrolled.",
  "unvarnished": "Presented plainly without much cosmetic smoothing, sweetening or disguise.",
  "warm": "Suggesting comfort, closeness, friendliness or a rounded and inviting character.",
  "cold": "Emotionally or timbrally cool, restrained or lacking obvious warmth.",
  "dark": "Weighted toward shadow, low-mid depth or reduced brightness in tone and mood.",
  "bright": "Rich in upper-frequency presence or perceived brilliance.",
  "muted": "Softened, damped or held back in brightness, energy or overt projection.",
  "luminous": "Glowing with clear inner light, presence or radiance rather than blunt glare.",
  "shadowy": "Dim, obscure or half-hidden in tonal color or atmosphere.",
  "sun-bleached": "Faded, dry and pale in character, as though exposed to strong light and heat.",
  "neon-lit": "Vivid, artificial and high-contrast, often suggesting synthetic color and nightlife energy."
};

const placeSceneDefinitions: Readonly<Record<string, string>> =
{
  "Orange County": "Geographic context rooted in Orange County, California, a Southern California region spanning coastal cities, dense suburbs, inland communities, and local independent music networks between Los Angeles and San Diego.",
  "Los Angeles": "Geographic or scene context tied to Los Angeles, a large and stylistically diverse music center shaped by recording studios, clubs, DIY spaces, film and media industries, immigrant communities, and overlapping rock, electronic, hip-hop, jazz, punk, and experimental scenes.",
  "Southern California": "A broad regional context covering the southern part of California, where dense urban centers, suburbs, coastline, desert edges, car culture, clubs, studios, and independent scenes can all shape the identity surrounding a release.",
  "coastal Southern California": "A regional setting centered on Southern California’s Pacific coast, combining beach and harbor environments, coastal suburbs and cities, ocean light, and the cultural overlap of Los Angeles, Orange County, and San Diego-area scenes.",
  "club culture": "A scene context organized around nightlife, DJs, dancing, sound systems, promoters, recurring venues, and the social circulation of music through clubs rather than primarily through seated concert settings.",
  "warehouse scene": "A scene built around large industrial or semi-industrial spaces used for parties, raves, performances, or temporary venues, often emphasizing loud sound systems, late hours, DIY organization, and less formal presentation.",
  "late-night city atmosphere": "An urban after-dark setting shaped by sparse traffic, artificial light, empty streets, residual nightlife, and the heightened isolation or possibility that can emerge when a city quiets down.",
  "urban nightlife": "A city-centered social environment of clubs, bars, late-night streets, venues, transit, crowds, and illuminated commercial districts, emphasizing movement and activity after dark.",
  "underground scene": "A music community operating outside the most visible commercial channels, often relying on small venues, informal networks, independent releases, niche audiences, and strong local or subcultural identity.",
  "DIY venue culture": "A scene organized around artist- or community-run spaces, house shows, temporary venues, volunteer labor, low-overhead presentation, and an emphasis on direct participation rather than formal commercial infrastructure.",
  "independent rock scene": "A network of rock artists, small labels, venues, promoters, college or community media, and self-directed production that operates with substantial independence from major-label systems.",
  "electronic club scene": "A dance-music environment centered on DJs, producers, clubs, promoters, sound systems, and genre communities where tracks are experienced socially through continuous programmed sets and late-night events.",
  "home studio": "A recording workspace located in a residence rather than a commercial studio, usually giving the artist greater schedule flexibility and control while working within the acoustic and equipment limits of a personal space.",
  "bedroom studio": "A compact home-recording setup built directly into a bedroom or similarly small personal room, often associated with headphone monitoring, close-range production, software instruments, overdubbing, and highly self-contained creation.",
  "rehearsal room": "A space primarily intended for practicing and arranging music as an ensemble; recordings made there often retain room interaction, working-performance energy, bleed, and the practical sound of a band preparing material.",
  "live room": "The acoustically active room in a recording studio where performers or instruments are captured, with room dimensions, reflections, microphone distance, and ensemble bleed contributing to the recorded sound.",
  "project studio": "A smaller professional or semi-professional studio built around focused production needs rather than the scale of a large commercial facility, typically combining recording, editing, mixing, and software-based production in one compact environment.",
  "warehouse studio": "A recording or production space housed in a large industrial-style building, offering substantial physical volume and potentially distinctive reflections, isolation challenges, or room ambience compared with conventional studio rooms.",
  "neon-lit cityscape": "An imagined urban setting dominated by artificial colored light, reflective streets, signage, glass, traffic, and nighttime architecture, commonly suggesting modernity, nightlife, futurism, or cinematic isolation.",
  "desert landscape": "An imagined or geographic setting defined by open arid space, heat, rock, sand, long horizons, sparse vegetation, and strong contrast between exposure, silence, distance, and scale.",
  "coastal atmosphere": "An atmosphere associated with ocean proximity: open horizon, moving air, salt, water, changing light, and a balance of spaciousness, weather, leisure, melancholy, or motion depending on context.",
  "night-drive setting": "An imagined setting of traveling by road after dark, combining forward motion, enclosed personal space, passing lights, repetition, distance, and the introspective or cinematic character of nighttime driving.",
  "industrial landscape": "A setting shaped by factories, warehouses, rail infrastructure, machinery, concrete, metal, utility structures, and large engineered spaces, often suggesting scale, repetition, labor, decay, or mechanical severity.",
  "smoky lounge atmosphere": "An imagined intimate nightlife setting associated with dim light, close seating, restrained performance, late hours, jazz- or cocktail-lounge ambience, and a softened or hazy sense of space.",
  "cinematic interior space": "An imagined indoor environment described less as a literal room than as a film-like scene, where architecture, lighting, reverberation, framing, and dramatic stillness help create narrative atmosphere."
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

function normalizeDefinitionRecord(
  definitions: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(definitions).map(
      ([label, definition]) => [
        normalizeDescriptorLabel(label),
        definition,
      ],
    ),
  );
}

const sharedLexicalDefinitions: Readonly<Record<string, string>> = {
  ...normalizeDefinitionRecord(moodDefinitions),
  ...normalizeDefinitionRecord(themeDefinitions),
  ...normalizeDefinitionRecord(artisticDirectionDefinitions),
  ...normalizeDefinitionRecord(musicalElementDefinitions),
  ...normalizeDefinitionRecord(productionDefinitions),
  ...normalizeDefinitionRecord(harmonyTheoryDefinitions),
  ...normalizeDefinitionRecord(rhythmDefinitions),
  ...normalizeDefinitionRecord(releaseContextDefinitions),
  ...normalizeDefinitionRecord(coreIdentityDefinitions),
  ...normalizeDefinitionRecord(performanceDefinitions),
  ...normalizeDefinitionRecord(songwritingDefinitions),
  ...normalizeDefinitionRecord(sonicQualityDefinitions),
  ...normalizeDefinitionRecord(placeSceneDefinitions),
  ...normalizeDefinitionRecord(sharedDuplicateDefinitions),
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
