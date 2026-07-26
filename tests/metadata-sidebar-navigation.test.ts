import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdjacentMetadataSidebarId,
  getMetadataSidebarScrollTop,
  normalizeMetadataSidebarWheelDelta,
  planMetadataSidebarWheelHandoff,
} from "../src/metadata-sidebar-navigation.js";

const navigationIds = [
  "release",
  "track-a",
  "track-b",
] as const;

test("moves between the release row and tracks in displayed order", () => {
  assert.equal(
    getAdjacentMetadataSidebarId(
      navigationIds,
      "release",
      "next",
    ),
    "track-a",
  );
  assert.equal(
    getAdjacentMetadataSidebarId(
      navigationIds,
      "track-a",
      "previous",
    ),
    "release",
  );
  assert.equal(
    getAdjacentMetadataSidebarId(
      navigationIds,
      "track-a",
      "next",
    ),
    "track-b",
  );
});

test("stops at the first and last sidebar rows", () => {
  assert.equal(
    getAdjacentMetadataSidebarId(
      navigationIds,
      "release",
      "previous",
    ),
    "release",
  );
  assert.equal(
    getAdjacentMetadataSidebarId(
      navigationIds,
      "track-b",
      "next",
    ),
    "track-b",
  );
});

test("recovers predictably when the active row is no longer present", () => {
  assert.equal(
    getAdjacentMetadataSidebarId(
      navigationIds,
      "missing",
      "next",
    ),
    "release",
  );
  assert.equal(
    getAdjacentMetadataSidebarId(
      navigationIds,
      "missing",
      "previous",
    ),
    "track-b",
  );
  assert.equal(
    getAdjacentMetadataSidebarId(
      [],
      "release",
      "next",
    ),
    null,
  );
});

test("does not move a sidebar row that is already fully visible", () => {
  assert.equal(
    getMetadataSidebarScrollTop({
      scrollTop: 120,
      clientHeight: 300,
      scrollHeight: 1200,
      itemTop: 180,
      itemHeight: 64,
      edgePadding: 8,
    }),
    120,
  );
});

test("moves only enough to expose a row above or below the viewport", () => {
  assert.equal(
    getMetadataSidebarScrollTop({
      scrollTop: 120,
      clientHeight: 300,
      scrollHeight: 1200,
      itemTop: 96,
      itemHeight: 64,
      edgePadding: 8,
    }),
    88,
  );
  assert.equal(
    getMetadataSidebarScrollTop({
      scrollTop: 120,
      clientHeight: 300,
      scrollHeight: 1200,
      itemTop: 390,
      itemHeight: 64,
      edgePadding: 8,
    }),
    162,
  );
});

test("clamps sidebar adjustments to the available scroll range", () => {
  assert.equal(
    getMetadataSidebarScrollTop({
      scrollTop: 20,
      clientHeight: 300,
      scrollHeight: 900,
      itemTop: 0,
      itemHeight: 64,
      edgePadding: 12,
    }),
    0,
  );
  assert.equal(
    getMetadataSidebarScrollTop({
      scrollTop: 560,
      clientHeight: 300,
      scrollHeight: 900,
      itemTop: 850,
      itemHeight: 80,
      edgePadding: 12,
    }),
    600,
  );
});


test("normalizes Firefox line and page wheel units", () => {
  assert.equal(
    normalizeMetadataSidebarWheelDelta({
      deltaY: -3,
      deltaMode: 1,
      clientHeight: 400,
    }),
    -48,
  );
  assert.equal(
    normalizeMetadataSidebarWheelDelta({
      deltaY: 1,
      deltaMode: 2,
      clientHeight: 400,
    }),
    400,
  );
});

test("leaves ordinary sidebar wheel movement to the browser", () => {
  assert.deepEqual(
    planMetadataSidebarWheelHandoff({
      scrollTop: 200,
      clientHeight: 300,
      scrollHeight: 1200,
      deltaY: -40,
    }),
    {
      sidebarDeltaY: 0,
      pageDeltaY: 0,
      intercept: false,
    },
  );
});

test("hands unused upward movement to the page at the sidebar top", () => {
  assert.deepEqual(
    planMetadataSidebarWheelHandoff({
      scrollTop: 18,
      clientHeight: 300,
      scrollHeight: 1200,
      deltaY: -50,
    }),
    {
      sidebarDeltaY: -18,
      pageDeltaY: -32,
      intercept: true,
    },
  );
});

test("hands unused downward movement to the page at the sidebar bottom", () => {
  assert.deepEqual(
    planMetadataSidebarWheelHandoff({
      scrollTop: 880,
      clientHeight: 300,
      scrollHeight: 1200,
      deltaY: 50,
    }),
    {
      sidebarDeltaY: 20,
      pageDeltaY: 30,
      intercept: true,
    },
  );
});
