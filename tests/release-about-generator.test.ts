import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildReleaseAboutDescription,
  getReleaseAboutPlaceholders,
  getReleaseAboutProfileCategoryIds,
  getReleaseAboutSuggestions,
  prefillReleaseAboutValuesFromProfile,
  releaseAboutTemplates,
  releaseProfileCategories,
} from "../src/release-about-generator.js";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const generatorComponentSource = await readFile(
  new URL("../src/ReleaseAboutGenerator.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("ships the full 16-template release-about library", () => {
  assert.equal(releaseAboutTemplates.length, 16);
  assert.deepEqual(
    releaseAboutTemplates.map(
      (template) => template.id,
    ),
    [
      "default-release",
      "very-short-single",
      "richer-single",
      "ep-snapshot",
      "album-evolution",
      "debut",
      "sonic-world",
      "contradiction",
      "instrumental-release",
      "musician-forward",
      "production-forward",
      "hip-hop-lyrical",
      "place-scene",
      "collaboration",
      "demo-archive",
      "minimal-high-brow",
    ],
  );
});

test("extracts bracketed fields in display order without duplicates", () => {
  const debut = releaseAboutTemplates.find(
    (template) => template.id === "debut",
  );

  assert.ok(debut);

  assert.deepEqual(
    getReleaseAboutPlaceholders(
      debut.template,
    ),
    [
      "Artist",
      "sound detail 1",
      "sound detail 2",
      "distinctive feature",
      "genre",
      "Release",
      "influence A",
      "influence B",
      "core identity",
    ],
  );
});

test("builds generated copy while leaving unresolved fields visible", () => {
  const result =
    buildReleaseAboutDescription(
      "[Release] by [Artist] is [quality].",
      {
        Release: "Gateway",
        Artist: "Nathan",
      },
    );

  assert.equal(
    result,
    "Gateway by Nathan is [quality].",
  );
});

test("every authorable template field has curated suggestions", () => {
  const automaticOrNameFields = new Set([
    "Artist",
    "Release",
    "Artist A",
    "Artist B",
  ]);

  for (const template of releaseAboutTemplates) {
    for (const placeholder of getReleaseAboutPlaceholders(
      template.template,
    )) {
      if (automaticOrNameFields.has(placeholder)) {
        continue;
      }

      assert.ok(
        getReleaseAboutSuggestions(placeholder).length > 0,
        `${template.id} should offer suggestions for [${placeholder}]`,
      );
    }
  }
});

test("album evolution direction fields cover EDM, rock, progressive, and theory language", () => {
  const earlier = getReleaseAboutSuggestions(
    "earlier artistic direction",
  );
  const next = getReleaseAboutSuggestions(
    "new direction",
  );

  for (const value of [
    "four-on-the-floor house production",
    "cinematic melodic techno",
    "progressive rock composition",
    "odd-meter progressive writing",
    "diatonic harmonic writing",
    "counterpoint-driven composition",
  ]) {
    assert.ok(
      earlier.includes(value),
      `earlier direction should include ${value}`,
    );
    assert.ok(
      next.includes(value),
      `new direction should include ${value}`,
    );
  }
});

test("genre and influence fields expose current Beatport-style electronic subgenre terminology", () => {
  const genres = getReleaseAboutSuggestions("genre");

  for (const value of [
    "Afro House",
    "Bass House",
    "Liquid Drum & Bass",
    "Melodic House & Techno",
    "Progressive House",
    "Techno (Raw / Deep / Hypnotic)",
    "Uplifting Trance",
    "Speed Garage",
  ]) {
    assert.ok(
      genres.includes(value),
      `genre suggestions should include ${value}`,
    );
  }
});

test("musical elements span EDM and progressive-rock production language", () => {
  const elements = getReleaseAboutSuggestions(
    "Old element",
  );

  for (const value of [
    "supersaw stacks",
    "Reese bass",
    "2-step garage drums",
    "power-chord riffs",
    "odd-meter drum patterns",
    "contrapuntal guitar lines",
  ]) {
    assert.ok(
      elements.includes(value),
      `element suggestions should include ${value}`,
    );
  }
});

test("theory-aware fields include harmonic, scalar, rhythmic, and formal terminology", () => {
  const theory = getReleaseAboutSuggestions(
    "rhythmic / harmonic characteristic",
  );

  for (const value of [
    "diatonic harmony",
    "diminished harmony",
    "pentatonic melody",
    "classical voice leading",
    "counterpoint",
    "polyrhythm",
    "odd meter",
    "build-breakdown-drop form",
  ]) {
    assert.ok(
      theory.includes(value),
      `theory suggestions should include ${value}`,
    );
  }
});

test("production fields include contemporary electronic production techniques", () => {
  const production = getReleaseAboutSuggestions(
    "production technique 1",
  );

  for (const value of [
    "sidechain compression",
    "granular synthesis",
    "resampling",
    "mid-side processing",
    "filter sweeps",
    "parallel distortion",
  ]) {
    assert.ok(
      production.includes(value),
      `production suggestions should include ${value}`,
    );
  }
});

test("editorial choices include expanded emotions and electronic adjective combinations", () => {
  const moods = getReleaseAboutSuggestions("emotion");
  const adjectives = getReleaseAboutSuggestions(
    "three-adjective",
  );

  assert.ok(moods.includes("catharsis"));
  assert.ok(moods.includes("transcendence"));
  assert.ok(
    adjectives.includes(
      "dark, hypnotic, propulsive",
    ),
  );
  assert.ok(
    adjectives.includes(
      "progressive, atmospheric, dynamic",
    ),
  );
});

test("core identity supports electronic and theory-centered release language", () => {
  const identity = getReleaseAboutSuggestions(
    "core identity",
  );

  for (const value of [
    "melodic storytelling through electronic production",
    "hypnotic repetition with gradual development",
    "classical voice leading inside modern production",
    "the tension between consonance and dissonance",
  ]) {
    assert.ok(identity.includes(value));
  }
});

test("Release About Generator is lazy-loaded out of the primary App chunk", () => {
  assert.match(
    appSource,
    /const LazyReleaseAboutGenerator = lazy\(async \(\) =>/,
  );
  assert.match(
    appSource,
    /import\(\s*"\.\/ReleaseAboutGenerator\.js"\s*\)/,
  );
  assert.match(
    appSource,
    /<LazyReleaseAboutGenerator/,
  );
  assert.doesNotMatch(
    appSource,
    /from "\.\/release-about-generator\.js"/,
  );
  assert.doesNotMatch(
    appSource,
    /function ReleaseAboutGenerator\(/,
  );
});

test("Release Description edit mode keeps Profile and More dropdown choices plus free-text entry", () => {
  assert.match(
    generatorComponentSource,
    /release-about-generator__suggestion-select/,
  );
  assert.match(
    generatorComponentSource,
    /Profile…/,
  );
  assert.match(
    generatorComponentSource,
    /More…/,
  );
  assert.match(
    generatorComponentSource,
    /<input/,
  );
  assert.doesNotMatch(
    generatorComponentSource,
    /<datalist/,
  );
  assert.match(
    generatorComponentSource,
    /Use generated description/,
  );
});

test("generator suggestion controls retain dedicated responsive styles", () => {
  assert.match(
    styles,
    /\.release-about-generator\s*\{/,
  );
  assert.match(
    styles,
    /\.release-about-generator__suggestion-select\s*\{/,
  );
  assert.match(
    styles,
    /\.release-about-generator__fields\s*\{[\s\S]*?grid-template-columns/,
  );
  assert.match(
    styles,
    /@media \(max-width: 52rem\)[\s\S]*?\.release-about-generator__fields/,
  );
});

test("Release Profile exposes normalized reusable descriptor categories", () => {
  assert.ok(releaseProfileCategories.length >= 14);

  const byId = new Map(
    releaseProfileCategories.map((category) => [category.id, category]),
  );

  assert.ok(byId.get("genres")?.options.includes("Progressive House"));
  assert.ok(byId.get("direction")?.options.includes("progressive rock composition"));
  assert.ok(byId.get("production")?.options.includes("sidechain compression"));
  assert.ok(byId.get("harmony-theory")?.options.includes("diatonic harmony"));
  assert.ok(byId.get("rhythm")?.options.includes("polyrhythm"));
  assert.ok(byId.get("identity")?.options.includes("emotionally direct songwriting"));
});

test("all authorable template placeholders map to one or more Release Profile categories", () => {
  const exempt = new Set([
    "artist",
    "release",
    "artist a",
    "artist b",
    "number",
  ]);

  for (const template of releaseAboutTemplates) {
    for (const placeholder of getReleaseAboutPlaceholders(template.template)) {
      if (exempt.has(placeholder.toLowerCase())) {
        continue;
      }

      assert.ok(
        getReleaseAboutProfileCategoryIds(placeholder).length > 0,
        `${template.id}: [${placeholder}] should map to Release Profile categories`,
      );
    }
  }
});

test("Release Profile prefills empty template fields without overwriting authored values", () => {
  const debut = releaseAboutTemplates.find((template) => template.id === "debut");
  assert.ok(debut);

  const result = prefillReleaseAboutValuesFromProfile(
    debut.template,
    {
      Artist: "Nathan",
      Release: "Gateway",
      genre: "alternative rock",
    },
    {
      genres: ["progressive rock", "electronica"],
      elements: ["dense guitar textures", "synthesized textures"],
      identity: ["emotionally direct songwriting"],
    },
  );

  assert.equal(result.Artist, "Nathan");
  assert.equal(result.Release, "Gateway");
  assert.equal(result.genre, "alternative rock");
  assert.equal(result["sound detail 1"], "dense guitar textures");
  assert.equal(result["sound detail 2"], "synthesized textures");
  assert.equal(result["influence A"], "progressive rock");
  assert.equal(result["influence B"], "electronica");
  assert.equal(result["core identity"], "emotionally direct songwriting");
});

test("three-adjective copy can be derived from selected profile qualities", () => {
  const result = prefillReleaseAboutValuesFromProfile(
    "[Release] is [three-adjective].",
    { Release: "Example" },
    {
      qualities: ["dark", "hypnotic", "propulsive"],
    },
  );

  assert.equal(result["three-adjective"], "dark, hypnotic, propulsive");
});

test("Release About Generator implements a two-stage canonical profile workflow", () => {
  assert.match(generatorComponentSource, /1\. Release Profile/);
  assert.match(generatorComponentSource, /2\. About Template/);
  assert.match(generatorComponentSource, /Reusable descriptor pool/);
  assert.match(generatorComponentSource, /Canonical Release Profile/);
  assert.match(generatorComponentSource, /Prefill empty fields/);
  assert.match(generatorComponentSource, /Continue to template/);
  assert.match(generatorComponentSource, /saved canonically in release\.toml/);
});


test("Release Profile compact workspace uses grouped cards, accessible tooltips, and collapsed custom inputs", () => {
  for (const label of [
    "Style & sound",
    "Composition",
    "Character",
    "Context",
  ]) {
    assert.match(generatorComponentSource, new RegExp(label.replace("&", "&")));
  }

  assert.match(generatorComponentSource, /release-profile-editor__info/);
  assert.match(generatorComponentSource, /role="tooltip"/);
  assert.match(generatorComponentSource, /aria-describedby=/);
  assert.match(generatorComponentSource, /\+ Custom descriptor/);
  assert.doesNotMatch(generatorComponentSource, /No descriptors selected\./);
  assert.match(generatorComponentSource, /Browse descriptors/);
  assert.match(generatorComponentSource, /<EditorialDescriptorBrowser/);
});

test("Release Description editor expands to the full metadata row during editing", () => {
  assert.match(
    appSource,
    /row\.path === "release\.description"[\s\S]*?metadata-table-row--release-description-editor/,
  );
  assert.match(
    styles,
    /\.metadata-table-row--release-description-editor\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
});

test("profile stage hides the final description textarea and keeps actions sticky", () => {
  assert.match(generatorComponentSource, /data-expanded=/);
  assert.match(generatorComponentSource, /data-stage=\{stage\}/);
  assert.match(
    styles,
    /data-expanded="true"\]\[data-stage="profile"\][\s\S]*?metadata-multiline-field[\s\S]*?> textarea/,
  );
  assert.match(
    styles,
    /\.release-profile-editor__footer\s*\{[\s\S]*?position:\s*sticky[\s\S]*?bottom:\s*0/,
  );
});

test("desktop Release Profile layout uses three columns with responsive two- and one-column fallbacks", () => {
  assert.match(
    styles,
    /\.release-profile-editor__categories\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 78rem\)[\s\S]*?\.release-profile-editor__categories[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 52rem\)[\s\S]*?\.release-profile-editor__categories[\s\S]*?grid-template-columns:\s*1fr/,
  );
});

test("rock, alternative, indie, psychedelic, and hybrid genre vocabulary is expanded", () => {
  const genres = getReleaseAboutSuggestions("genre");
  for (const value of [
    "garage rock",
    "indie rock",
    "shoegaze",
    "noise rock",
    "post-punk",
    "progressive metal",
    "psychedelic rock",
    "neo-psychedelia",
    "acid rock",
    "space rock",
    "synth-punk",
    "trip-hop",
    "downbeat",
    "acid jazz",
    "dub",
  ]) {
    assert.ok(genres.includes(value), `genre vocabulary should include ${value}`);
  }
});

test("artistic direction spans live rock, psychedelic, progressive, electronic-rock, and downtempo language", () => {
  const direction = getReleaseAboutSuggestions("new direction");
  for (const value of [
    "garage-rock immediacy",
    "shoegaze wall-of-sound guitar layering",
    "psychedelic studio experimentation",
    "suite-like progressive composition",
    "progressive-metal technicality",
    "synth-punk collision",
    "cinematic trip-hop atmosphere",
    "dub-informed downtempo production",
    "synth-heavy melodic pop",
  ]) {
    assert.ok(direction.includes(value), `direction vocabulary should include ${value}`);
  }
});

test("rock production and theory vocabulary covers studio technique, guitar language, and progressive composition", () => {
  const production = getReleaseAboutSuggestions("production technique 1");
  for (const value of [
    "live-room bleed",
    "double-tracked guitars",
    "spring reverb",
    "tape echo",
    "phasing",
    "varispeed recording",
    "vinyl crackle and sampled ambience",
  ]) {
    assert.ok(production.includes(value), `production vocabulary should include ${value}`);
  }

  const theory = getReleaseAboutSuggestions("rhythmic / harmonic characteristic");
  for (const value of [
    "minor-pentatonic melody",
    "Mixolydian rock harmony",
    "modal riffing",
    "thematic reprise",
    "suite form",
    "metric modulation",
    "mixed meter",
    "loud-quiet-loud form",
  ]) {
    assert.ok(theory.includes(value), `theory vocabulary should include ${value}`);
  }
});

test("mood and quality pools include attitude, spontaneity, live energy, edge, and rebellion", () => {
  const moods = getReleaseAboutSuggestions("emotion");
  for (const value of [
    "swagger",
    "defiance",
    "rebelliousness",
    "spontaneity",
    "live-wire energy",
    "edginess",
    "sardonic humor",
    "angst",
  ]) {
    assert.ok(moods.includes(value), `mood vocabulary should include ${value}`);
  }

  const qualities = getReleaseAboutSuggestions("quality");
  for (const value of [
    "rebellious",
    "edgy",
    "spontaneous",
    "live",
    "visceral",
    "rowdy",
    "swaggering",
    "kaleidoscopic",
    "noirish",
    "theatrical",
  ]) {
    assert.ok(qualities.includes(value), `quality vocabulary should include ${value}`);
  }
});

test("profile categories expose expanded rock vocabulary rather than only template-specific lists", () => {
  const byId = new Map(
    releaseProfileCategories.map((category) => [category.id, category]),
  );

  assert.ok(byId.get("elements")?.options.includes("wall-of-sound guitar layers"));
  assert.ok(byId.get("instrumentation")?.options.includes("Mellotron"));
  assert.ok(byId.get("production")?.options.includes("parallel drum compression"));
  assert.ok(byId.get("songwriting")?.options.includes("riff-first songwriting"));
  assert.ok(byId.get("performance")?.options.includes("spontaneous live-band performance"));
  assert.ok(byId.get("identity")?.options.includes("the tension between attitude and vulnerability"));
});

test("template selection is restored from the canonical editorial snapshot", () => {
  assert.match(
    generatorComponentSource,
    /editorialSnapshot\.descriptionStyle/,
  );
  assert.match(
    generatorComponentSource,
    /const templateId =[\s\S]*?requestedTemplate\?\.id[\s\S]*?releaseAboutTemplates\[0\]\.id/,
  );
});

test("switching About templates automatically prefills empty fields from the retained Release Profile", () => {
  assert.match(
    generatorComponentSource,
    /const selectTemplate = \(nextTemplateId: string\) =>/,
  );
  assert.match(
    generatorComponentSource,
    /onEditorialSnapshotChange\([\s\S]*?serializeReleaseProfileToStorage\(\{[\s\S]*?descriptionStyle:\s*nextTemplate\.id,[\s\S]*?passthroughDescriptorIds:[\s\S]*?hydratedProfile\.passthroughDescriptorIds[\s\S]*?\}\),[\s\S]*?\);[\s\S]*?setValues\(\(current\) =>[\s\S]*?prefillReleaseAboutValuesFromProfile\([\s\S]*?nextTemplate\.template,[\s\S]*?current,[\s\S]*?profile/,
  );
  assert.match(
    generatorComponentSource,
    /onChange=\{\(event\) =>[\s\S]*?selectTemplate\(event\.target\.value\)/,
  );
});

test("template switching keeps authored values because profile prefill only fills empty placeholders", () => {
  const first = prefillReleaseAboutValuesFromProfile(
    "[Release] uses [quality] and [instrument 1].",
    {
      Release: "Indoor Lightning",
      quality: "raw",
    },
    {
      qualities: ["rebellious"],
      instrumentation: ["electric guitar"],
    },
  );

  assert.equal(first.quality, "raw");
  assert.equal(first["instrument 1"], "electric guitar");

  const second = prefillReleaseAboutValuesFromProfile(
    "[Release] develops through [instrument 1] and [texture].",
    first,
    {
      instrumentation: ["electric guitar"],
      elements: ["dense guitar textures"],
    },
  );

  assert.equal(second["instrument 1"], "electric guitar");
  assert.equal(second.texture, "dense guitar textures");
  assert.equal(second.quality, "raw");
});
