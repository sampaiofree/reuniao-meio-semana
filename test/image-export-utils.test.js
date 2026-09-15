import assert from "node:assert/strict";
import test from "node:test";
import {
  getExportFontScaleCandidates,
  normalizeExportFontScale,
  usesLargeFontExportLayout
} from "../image-export-utils.js";

test("normalizes export font scales to the supported range and step", () => {
  assert.equal(normalizeExportFontScale(null), 100);
  assert.equal(normalizeExportFontScale("not-a-number"), 100);
  assert.equal(normalizeExportFontScale(70), 80);
  assert.equal(normalizeExportFontScale(83), 85);
  assert.equal(normalizeExportFontScale(117), 115);
  assert.equal(normalizeExportFontScale(130), 130);
  assert.equal(normalizeExportFontScale(190), 180);
});

test("builds descending font scale candidates down to the minimum", () => {
  assert.deepEqual(getExportFontScaleCandidates(100), [100, 95, 90, 85, 80]);
  assert.deepEqual(getExportFontScaleCandidates(120), [120, 115, 110, 105, 100, 95, 90, 85, 80]);
  assert.deepEqual(getExportFontScaleCandidates(180), [180, 175, 170, 165, 160, 155, 150, 145, 140, 135, 130, 125, 120, 115, 110, 105, 100, 95, 90, 85, 80]);
  assert.deepEqual(getExportFontScaleCandidates(80), [80]);
});

test("uses the stacked export layout only above 120 percent", () => {
  assert.equal(usesLargeFontExportLayout(120), false);
  assert.equal(usesLargeFontExportLayout(125), true);
  assert.equal(usesLargeFontExportLayout(180), true);
});
