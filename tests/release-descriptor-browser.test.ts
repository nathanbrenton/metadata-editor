import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getEditorialDescriptorBrowserCategoryDefinitions,
  getEditorialDescriptorBrowserDefinition,
  getEditorialDescriptorBrowserFamilies,
  getEditorialDescriptorBrowserRelated,
  getEditorialDescriptorBrowserResults,
  getEditorialDescriptorBrowserSubfamilies,
} from "../src/editorial-descriptor-browser.js";
import {
  getReleaseProfileCategoryForDescriptor,
  getReleaseProfileDescriptorScope,
} from "../src/release-profile-descriptor-scope.js";
import {
  searchReleaseDescriptors,
} from "../src/release-descriptor-ontology.js";

const generatorSource = await readFile(
  new URL("../src/ReleaseAboutGenerator.tsx", import.meta.url),
  "utf8",
);
const browserSource = await readFile(
  new URL("../src/EditorialDescriptorBrowser.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Release Profile cards open the shared Editorial Descriptor Browser instead of flat descriptor selects", () => {
  assert.match(
    generatorSource,
    /Browse descriptors/,
  );
  assert.match(
    generatorSource,
    /<EditorialDescriptorBrowser/,
  );
  assert.doesNotMatch(
    generatorSource,
    /<option value="">Choose descriptor…<\/option>/,
  );
});

test("the browser foundation is entity-neutral for future Artist Profile reuse", () => {
  assert.match(
    browserSource,
    /export function EditorialDescriptorBrowser/,
  );
  assert.doesNotMatch(
    browserSource,
    /ReleaseProfileSelection/,
  );
  assert.match(
    generatorSource,
    /getReleaseProfileDescriptorScope/,
  );
});

test("mood browsing separates music emotion from attitude", () => {
  const scope =
    getReleaseProfileDescriptorScope(
      "moods-emotions",
    );

  assert.deepEqual(scope, ["mood", "attitude"]);
  assert.deepEqual(
    getEditorialDescriptorBrowserCategoryDefinitions(
      scope,
    ).map((definition) => definition.id),
    ["mood", "attitude"],
  );

  const moodFamilies =
    getEditorialDescriptorBrowserFamilies({
      ontologyCategories: scope,
      ontologyCategory: "mood",
      level: "all",
    }).map((entry) => entry.label);

  for (const expected of [
    "Wonder",
    "Tenderness",
    "Joyful activation",
    "Tension",
    "Sadness",
  ]) {
    assert.ok(
      moodFamilies.includes(expected),
      `missing mood family ${expected}`,
    );
  }

  const attitudeFamilies =
    getEditorialDescriptorBrowserFamilies({
      ontologyCategories: scope,
      ontologyCategory: "attitude",
      level: "all",
    });

  assert.ok(attitudeFamilies.length > 0);
});

test("genre browsing exposes rock and electronic families with subfamilies", () => {
  const scope =
    getReleaseProfileDescriptorScope("genres");
  const families =
    getEditorialDescriptorBrowserFamilies({
      ontologyCategories: scope,
      ontologyCategory: "genre",
      level: "all",
    }).map((entry) => entry.label);

  assert.ok(families.includes("Rock"));
  assert.ok(families.includes("Electronic"));

  const rockSubfamilies =
    getEditorialDescriptorBrowserSubfamilies({
      ontologyCategories: scope,
      ontologyCategory: "genre",
      family: "Rock",
      level: "all",
    }).map((entry) => entry.label);

  assert.ok(
    rockSubfamilies.some((label) =>
      /alternative|indie/i.test(label),
    ),
  );
  assert.ok(
    rockSubfamilies.some((label) =>
      /progressive/i.test(label),
    ),
  );
  assert.ok(
    rockSubfamilies.some((label) =>
      /psychedelic/i.test(label),
    ),
  );
});

test("common and advanced filtering reduce theory browsing without losing advanced vocabulary", () => {
  const scope =
    getReleaseProfileDescriptorScope(
      "harmony-theory",
    );
  const common =
    getEditorialDescriptorBrowserResults({
      ontologyCategories: scope,
      ontologyCategory: "theory",
      level: "common",
      query: "",
    });
  const advanced =
    getEditorialDescriptorBrowserResults({
      ontologyCategories: scope,
      ontologyCategory: "theory",
      level: "advanced",
      query: "",
    });

  assert.ok(common.length > 0);
  assert.ok(advanced.length > 0);
  assert.ok(
    common.every(
      (descriptor) => descriptor.level === "common",
    ),
  );
  assert.ok(
    advanced.every(
      (descriptor) => descriptor.level === "advanced",
    ),
  );
});

test("browser search uses ontology aliases and search terms", () => {
  const result =
    getEditorialDescriptorBrowserResults({
      ontologyCategories:
        getReleaseProfileDescriptorScope(
          "genres",
        ),
      level: "all",
      query: "prog rock",
    });

  assert.equal(
    result[0]?.label,
    "Progressive Rock",
  );
});

test("related descriptors can route into the correct Release Profile category", () => {
  const rebellious =
    searchReleaseDescriptors(
      "rebellious",
      {
        category: "attitude",
        limit: 1,
      },
    )[0];

  assert.ok(rebellious);

  const related =
    getEditorialDescriptorBrowserRelated(
      rebellious,
    );

  assert.ok(related.length > 0);
  assert.equal(
    getReleaseProfileCategoryForDescriptor(
      rebellious,
    ),
    "moods-emotions",
  );

  const liveWire = related.find(
    (descriptor) =>
      descriptor.label === "live-wire",
  );

  assert.ok(liveWire);
  assert.equal(
    getReleaseProfileCategoryForDescriptor(
      liveWire,
    ),
    "qualities",
  );
});

test("Editorial Descriptor Browser is searchable, tiered, hierarchical, related-aware, and accessible as a dialog", () => {
  assert.match(browserSource, /role="dialog"/);
  assert.match(browserSource, /aria-modal="true"/);
  assert.match(browserSource, /type="search"/);
  assert.match(browserSource, /Common/);
  assert.match(browserSource, /Advanced/);
  assert.match(browserSource, />Family</);
  assert.match(browserSource, />Subfamily</);
  assert.match(browserSource, /Related to/);
  assert.match(browserSource, /event\.key === "Escape"/);
});

test("Descriptor Browser has full-screen responsive modal styles", () => {
  assert.match(
    styles,
    /\.release-descriptor-browser__backdrop\s*\{[\s\S]*?position:\s*fixed/,
  );
  assert.match(
    styles,
    /\.release-descriptor-browser__taxonomy\s*\{[\s\S]*?grid-template-columns:/,
  );
  assert.match(
    styles,
    /@media \(max-width: 52rem\)[\s\S]*?\.release-descriptor-browser\s*\{[\s\S]*?min-height:\s*100vh/,
  );
});

test("descriptor rows show definitions and move taxonomy paths into tooltips", () => {
  assert.match(
    browserSource,
    /getEditorialDescriptorBrowserDefinition/,
  );
  assert.match(
    browserSource,
    /className="release-descriptor-browser__path-help"[\s\S]*?title=\{path\}/,
  );
  assert.match(
    browserSource,
    /<small\s+title=\{definition\}>\s*\{definition\}\s*<\/small>/,
  );
  /*
   * Taxonomy paths are allowed in title/aria-label expressions elsewhere in
   * the component. Guard only against rendering the path itself as the visible
   * descriptor <small> line.
   */
  assert.doesNotMatch(
    browserSource,
    /<small>\s*\{path\}\s*<\/small>/,
  );
  assert.doesNotMatch(
    browserSource,
    /<small>\s*\{\s*getEditorialDescriptorBrowserPath\(/,
  );
});

test("every normalized descriptor receives a non-empty editorial definition", async () => {
  const { releaseDescriptorOntology } = await import(
    "../src/release-descriptor-ontology.js"
  );

  for (const descriptor of releaseDescriptorOntology) {
    const definition =
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      );

    assert.ok(
      definition.trim().length >= 30,
      `definition too short for ${descriptor.category}:${descriptor.label}`,
    );
  }
});

test("high-value descriptor definitions explain meaning rather than repeating taxonomy", () => {
  const lookups = [
    ["optimistic", "positive expectation"],
    ["otherworldly", "ordinary physical reality"],
    ["paranoid", "unseen threat"],
    ["sidechain compression", "key signal"],
    ["diatonic harmony", "prevailing diatonic key"],
    ["Progressive Rock", "thematic development"],
    ["rebellious", "resistance to rules"],
  ] as const;

  for (const [query, expected] of lookups) {
    const descriptor =
      searchReleaseDescriptors(query, {
        limit: 1,
      })[0];

    assert.ok(descriptor, `missing descriptor ${query}`);
    assert.match(
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      ),
      new RegExp(expected, "i"),
    );
  }
});

test("related descriptor controls also expose definitions while keeping taxonomy paths in tooltips", () => {
  assert.match(
    browserSource,
    /release-descriptor-browser__related[\s\S]*?getEditorialDescriptorBrowserDefinition/,
  );
  assert.match(
    browserSource,
    /title=\{[\s\S]*?getEditorialDescriptorBrowserPath\([\s\S]*?descriptor/,
  );
});
