import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Staging caps visible completion reminders and exposes overflow", () => {
  assert.match(appSource, /STAGING_COMPLETION_VISIBLE_LIMIT = 5/);
  assert.match(
    appSource,
    /visibleCompletionReminders =[\s\S]*?slice\([\s\S]*?0,[\s\S]*?STAGING_COMPLETION_VISIBLE_LIMIT/,
  );
  assert.match(
    appSource,
    /hiddenCompletionReminders =[\s\S]*?slice\([\s\S]*?STAGING_COMPLETION_VISIBLE_LIMIT/,
  );
  assert.match(appSource, /className="staging-completion-overflow"/);
  assert.match(appSource, /\+\{hiddenCompletionReminders\.length\}/);
  assert.match(
    appSource,
    /className="staging-completion-overflow-popover"/,
  );
});

test("completion reminder priority favors assets then public metadata then technical metadata", () => {
  assert.match(appSource, /priority:\s*10/);
  assert.match(appSource, /priority:\s*11/);
  assert.match(appSource, /priority:\s*12/);
  assert.match(appSource, /priority:\s*20/);
  assert.match(appSource, /priority:\s*25/);
  assert.match(appSource, /priority:\s*30/);
  assert.match(appSource, /left\.priority - right\.priority/);
});

test("technical reminder labels stay compact while descriptions remain explicit", () => {
  assert.match(
    appSource,
    /"track\.audio\.time_signature": "Time Sig"/,
  );
  assert.match(
    appSource,
    /"track\.audio\.tuning_hz": "Tuning"/,
  );
  assert.match(
    appSource,
    /"track\.audio\.time_signature": "Time Signature"/,
  );
  assert.match(
    appSource,
    /"track\.audio\.tuning_hz": "Tuning Reference"/,
  );
  assert.match(appSource, /\{reminder\.title\}/);
});

test("overflow reminders retain direct actions without opening Build", () => {
  assert.match(appSource, /function openStagingCompletionReminder/);
  assert.match(
    appSource,
    /className="staging-completion-overflow"[\s\S]*?event\.stopPropagation\(\)/,
  );
  assert.match(
    appSource,
    /className=\{`staging-completion-overflow-item is-\$\{reminder\.tone\}`\}[\s\S]*?openStagingCompletionReminder\(/,
  );
  assert.match(
    styles,
    /\.staging-completion-overflow-popover\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*60;/,
  );
});
