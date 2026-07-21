import assert from "node:assert/strict";
import test from "node:test";

import {
  findProductionContextField,
  productionContextFields,
  resolveProductionContextGroup,
} from "../shared/production-context.js";

test(
  "keeps production, recording, and editing as independent metadata groups",
  () => {
    assert.equal(
      resolveProductionContextGroup(
        "production.production_type",
      ),
      "Production",
    );
    assert.equal(
      resolveProductionContextGroup(
        "production.recording.location",
      ),
      "Recording",
    );
    assert.equal(
      resolveProductionContextGroup(
        "production.editing.location",
      ),
      "Editing",
    );
  },
);

test(
  "offers independent location and system fields for every production stage",
  () => {
    const paths = new Set(
      productionContextFields.map(
        (field) => field.path,
      ),
    );

    assert.equal(
      paths.has("production.location"),
      true,
    );
    assert.equal(
      paths.has("production.daw"),
      true,
    );
    assert.equal(
      paths.has(
        "production.recording.location",
      ),
      true,
    );
    assert.equal(
      paths.has(
        "production.recording.system",
      ),
      true,
    );
    assert.equal(
      paths.has(
        "production.editing.location",
      ),
      true,
    );
    assert.equal(
      paths.has(
        "production.editing.system",
      ),
      true,
    );
  },
);

test(
  "provides practical guidance for editing fields",
  () => {
    const field = findProductionContextField(
      "production.editing.system",
    );

    assert.ok(field);
    assert.equal(field.group, "Editing");
    assert.match(field.label, /Editing DAW/);
    assert.equal(
      field.examples?.includes("Logic Pro"),
      true,
    );
  },
);
