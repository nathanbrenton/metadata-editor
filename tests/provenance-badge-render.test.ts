import assert from "node:assert/strict";
import test from "node:test";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveReleaseProvenance,
  resolveTrackProvenance,
} from "@hiplingo/media-player/provenance";

/*
 * Behaviour test: renders the real shared component and inspects its markup.
 * The package source is compiled here without a bundler, which uses the
 * classic JSX transform, so React must be in scope before it loads.
 */
Object.assign(globalThis, { React });
const { ProvenanceBadge } = await import(
  "../../packages/media-player/src/ProvenanceBadge.js"
);

const render = (
  props: Parameters<typeof ProvenanceBadge>[0],
) =>
  renderToStaticMarkup(
    React.createElement(ProvenanceBadge, props),
  );

test("renders nothing for untagged media", () => {
  assert.equal(render({ provenance: null }), "");
  assert.equal(
    render({ provenance: resolveTrackProvenance({}, {}) }),
    "",
  );
});

test("renders the tier label, tooltip, and an accessible description", () => {
  const markup = render({
    provenance: resolveTrackProvenance(
      { provenance: { origin: "human" } },
      {},
    ),
  });

  assert.match(markup, /data-tier="human"/);
  assert.match(markup, /aria-hidden="true">Human</);
  assert.match(markup, /title="[^"]*No AI-generated audio/);
  assert.match(markup, /Provenance: Human\./);
});

test("shows the origin detail only in the full variant", () => {
  const provenance = resolveTrackProvenance(
    { provenance: { origin: "ai-generated-text-prompt" } },
    {},
  );

  assert.doesNotMatch(render({ provenance }), /Text prompt</);
  assert.match(
    render({ provenance, variant: "full" }),
    /data-tier="ai"[\s\S]*>AI<[\s\S]*>Text prompt</,
  );
});

test("includes the authored note in the description and marks the artwork surface", () => {
  const markup = render({
    provenance: resolveReleaseProvenance(
      {
        provenance: {
          origin: "ai-assisted",
          note: "AI backing vocals only.",
        },
      },
      [{}, {}],
    ),
    surface: "artwork",
  });

  assert.match(markup, /data-tier="some-ai"/);
  assert.match(markup, /data-surface="artwork"/);
  assert.match(markup, /AI backing vocals only\./);
});
