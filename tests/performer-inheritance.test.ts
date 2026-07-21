import assert from "node:assert/strict";
import test from "node:test";

import {
  createTrackPerformerOverride,
  resolveEffectivePerformerRecords,
  type PerformerInheritanceRecord,
} from "../src/performer-inheritance.js";

const releaseRecords: PerformerInheritanceRecord[] = [
  {
    key: "release-0",
    sourceIndex: 0,
    name: "Nathan Brenton",
    role: "guitar",
    sortName: "Brenton, Nathan",
  },
  {
    key: "release-1",
    sourceIndex: 1,
    name: "Alex Example",
    role: "drums",
    sortName: "Example, Alex",
  },
];

test(
  "uses the release performer baseline while a track has no local records",
  () => {
    const result = resolveEffectivePerformerRecords(
      releaseRecords,
      [],
    );

    assert.equal(result.mode, "release");
    assert.deepEqual(
      result.effective.map(
        (record) => [record.name, record.role],
      ),
      [
        ["Nathan Brenton", "guitar"],
        ["Alex Example", "drums"],
      ],
    );
  },
);

test(
  "treats a nonempty track performer list as a complete local override",
  () => {
    const local = [
      {
        ...releaseRecords[0]!,
        key: "track-0",
        role: "electric guitar",
      },
    ];
    const result = resolveEffectivePerformerRecords(
      releaseRecords,
      local,
    );

    assert.equal(result.mode, "track");
    assert.deepEqual(result.effective, local);
  },
);

test(
  "starts track customization from independent copies of release performers",
  () => {
    const override = createTrackPerformerOverride(
      releaseRecords,
    );

    assert.equal(override.length, 2);
    assert.equal(
      override.every(
        (record) => record.sourceIndex === null,
      ),
      true,
    );
    assert.notEqual(override[0], releaseRecords[0]);
    override.splice(1, 1);
    assert.equal(releaseRecords.length, 2);
  },
);
