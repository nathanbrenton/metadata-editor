import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVENANCE_ORIGINS,
  PROVENANCE_ORIGIN_VALUES,
  findProvenanceOrigin,
  resolveReleaseProvenance,
  resolveTrackProvenance,
} from "@hiplingo/media-player/provenance";

import {
  applyMetadataCreations,
} from "../server/metadata-change-set.js";
import {
  findMetadataField,
} from "../server/metadata-registry.js";
import {
  buildMissingInheritedMetadataRows,
  resolveInheritedReleaseValue,
  trackReleaseInheritancePaths,
} from "../src/release-inheritance.js";

const tagged = (origin: string, note?: string) => ({
  provenance: { origin, ...(note ? { note } : {}) },
});

test("every provenance origin maps to exactly one of the three public tiers", () => {
  assert.deepEqual(
    [...new Set(PROVENANCE_ORIGINS.map((origin) => origin.tier))].sort(),
    ["ai", "human", "some-ai"],
  );
  assert.equal(
    new Set(PROVENANCE_ORIGIN_VALUES).size,
    PROVENANCE_ORIGIN_VALUES.length,
  );
  assert.equal(findProvenanceOrigin("human")?.tier, "human");
  assert.equal(findProvenanceOrigin("ai-assisted")?.tier, "some-ai");
  assert.equal(findProvenanceOrigin("ai-generated")?.tier, "ai");
  assert.equal(
    findProvenanceOrigin(" AI-Generated-Text-Prompt ")?.detail,
    "Text prompt",
  );
  assert.equal(
    findProvenanceOrigin("ai-generated-audio-prompt")?.tier,
    "ai",
  );
});

test("unknown, blank, and missing origins never produce a bubble", () => {
  assert.equal(findProvenanceOrigin("mostly human"), null);
  assert.equal(findProvenanceOrigin(""), null);
  assert.equal(findProvenanceOrigin(true), null);
  assert.equal(resolveTrackProvenance({}, {}), null);
  assert.equal(resolveTrackProvenance(undefined, undefined), null);
  assert.equal(
    resolveTrackProvenance(tagged("robot"), tagged("")),
    null,
  );
});

test("a track uses its own origin and otherwise inherits the release default", () => {
  const release = tagged("human", "Recorded live to tape.");

  const inherited = resolveTrackProvenance({}, release);
  assert.equal(inherited?.tier, "human");
  assert.equal(inherited?.source, "release");
  assert.equal(inherited?.note, "Recorded live to tape.");

  const overridden = resolveTrackProvenance(
    tagged("ai-generated-audio-prompt"),
    release,
  );
  assert.equal(overridden?.tier, "ai");
  assert.equal(overridden?.label, "AI");
  assert.equal(overridden?.detail, "Audio prompt");
  assert.equal(overridden?.source, "track");
  assert.equal(overridden?.note, null);
});

test("a release bubble summarizes its tracks without overclaiming", () => {
  const human = tagged("human");

  assert.equal(
    resolveReleaseProvenance(human, [{}, {}])?.tier,
    "human",
  );
  assert.equal(
    resolveReleaseProvenance({}, [
      tagged("ai-generated-text-prompt"),
      tagged("ai-generated-text-prompt"),
    ])?.detail,
    "Text prompt",
  );

  const mixedAi = resolveReleaseProvenance({}, [
    tagged("ai-generated-text-prompt"),
    tagged("ai-generated"),
  ]);
  assert.equal(mixedAi?.tier, "ai");
  assert.equal(mixedAi?.detail, null);

  assert.equal(
    resolveReleaseProvenance(human, [{}, tagged("ai-generated")])?.tier,
    "some-ai",
  );
  assert.equal(
    resolveReleaseProvenance(human, [{}, tagged("ai-assisted")])?.tier,
    "some-ai",
  );

  // One untagged track: neither "Human" nor "AI" can be claimed.
  assert.equal(
    resolveReleaseProvenance({}, [human, {}]),
    null,
  );
  assert.equal(
    resolveReleaseProvenance({}, [tagged("ai-generated"), {}])?.tier,
    "some-ai",
  );
  assert.equal(resolveReleaseProvenance({}, [{}, {}]), null);
  assert.equal(resolveReleaseProvenance(human, [])?.tier, "human");
});

test("registers release and track provenance with the shared vocabulary", () => {
  for (const scope of ["release", "track"] as const) {
    const origin = findMetadataField(`${scope}.provenance.origin`);
    const note = findMetadataField(`${scope}.provenance.note`);

    assert.ok(origin);
    assert.ok(note);
    assert.equal(origin.storageFileRole, scope);
    assert.equal(origin.required, false);
    assert.equal(origin.editor?.control, "select-or-custom");
    assert.deepEqual(
      origin.editor?.options,
      [...PROVENANCE_ORIGIN_VALUES],
    );
    assert.equal(
      origin.presentation?.group,
      "Release & Track Identity",
    );
  }

  assert.equal(
    findMetadataField("track.provenance.origin")?.inherited,
    true,
  );
  assert.equal(
    trackReleaseInheritancePaths.get("track.provenance.origin"),
    "release.provenance.origin",
  );
});

test("track editor shows the release provenance as an inherited row", () => {
  const field = findMetadataField("track.provenance.origin");
  assert.ok(field);

  const trackDocument = {
    filename: "track.toml",
    scope: "track" as const,
    parsed: { track: { id: "t", title: "T" } },
  };
  const releaseDocuments = [
    {
      filename: "release.toml",
      scope: "release" as const,
      parsed: { release: tagged("ai-assisted") },
    },
  ];
  const rows = buildMissingInheritedMetadataRows(
    trackDocument,
    releaseDocuments,
    [field],
    "track",
  );

  assert.deepEqual(
    rows.map((row) => row.path),
    ["track.provenance.origin"],
  );
  assert.deepEqual(
    resolveInheritedReleaseValue(
      trackDocument,
      rows[0],
      releaseDocuments,
    ),
    {
      sourcePath: "release.provenance.origin",
      value: "ai-assisted",
    },
  );
});

test("adding provenance creates the nested table in an existing document", () => {
  const updated = applyMetadataCreations(
    { track: { id: "t", explicit: false } },
    [{ path: "track.provenance.origin", value: "human" }],
  ) as { track: Record<string, unknown> };

  assert.deepEqual(updated.track.provenance, { origin: "human" });
  assert.equal(updated.track.explicit, false);
});
