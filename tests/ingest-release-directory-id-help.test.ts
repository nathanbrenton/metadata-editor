import assert from "node:assert/strict";
import test from "node:test";

import {
  workflowFaqItems,
} from "../src/workflow-help-content.js";

test(
  "documents generated and overridden staging release directory IDs",
  () => {
    const text = workflowFaqItems
      .map(({ question, answer }) =>
        `${question} ${answer}`,
      )
      .join(" ");

    assert.match(
      text,
      /YYYY-MM-DD_release-name/,
    );
    assert.match(text, /override/i);
    assert.match(text, /Use generated ID/);
  },
);
