import assert from "node:assert/strict";
import test from "node:test";
import { parseGenerationCoverage } from "../lib/coverage.ts";

test("coverage accepts a mixed result and returns only normalized contract fields", () => {
  const input = {
    features: [
      { id: " ui ", label: " Control panel ", status: "implemented", ignored: { raw: "unused" } },
      { id: "farm", label: "Auto Farm", status: "unavailable", reason: " Missing remote evidence " },
    ],
    uiVerified: true,
    arbitrary: { html: "unused" },
  };
  const coverage = parseGenerationCoverage(input);
  assert.deepEqual(coverage, {
    features: [
      { id: "ui", label: "Control panel", status: "implemented" },
      { id: "farm", label: "Auto Farm", status: "unavailable", reason: "Missing remote evidence" },
    ],
    uiVerified: true,
  });
  assert.notEqual(coverage?.features, input.features);
  assert.notEqual(coverage?.features[0], input.features[0]);
  assert.deepEqual(parseGenerationCoverage({ features: [], uiVerified: false }), { features: [], uiVerified: false });
});

test("coverage rejects malformed objects, empty strings and non-boolean UI results", () => {
  const feature = { id: "ui", label: "Panel", status: "implemented" };
  for (const value of [
    null, undefined, [], "coverage", {},
    { features: {}, uiVerified: true },
    { features: [null], uiVerified: true },
    { features: [[]], uiVerified: true },
    { features: [feature], uiVerified: "true" },
    { features: [feature], uiVerified: 1 },
    { features: [feature] },
    { features: [{ ...feature, id: " " }], uiVerified: true },
    { features: [{ ...feature, label: "\n\t" }], uiVerified: true },
    { features: [{ ...feature, id: 1 }], uiVerified: true },
    { features: [{ ...feature, label: {} }], uiVerified: true },
    { features: [{ ...feature, reason: " " }], uiVerified: true },
    { features: [{ ...feature, reason: null }], uiVerified: true },
  ]) assert.equal(parseGenerationCoverage(value), null);
});

test("coverage rejects unknown status values instead of claiming implementation", () => {
  for (const status of ["confirmed", "possible", "IMPLEMENTED", " unavailable ", true, 1, null, undefined]) {
    assert.equal(parseGenerationCoverage({ features: [{ id: "farm", label: "Farm", status }], uiVerified: false }), null);
  }
});

test("coverage retains markup-like content as strings without accepting raw fields", () => {
  const label = '<img src=x onerror="alert(1)">';
  const reason = "<script>alert('x')</script>";
  assert.deepEqual(parseGenerationCoverage({
    features: [{ id: "farm", label, status: "unavailable", reason, raw: { __html: reason } }],
    uiVerified: false,
    html: label,
  }), { features: [{ id: "farm", label, status: "unavailable", reason }], uiVerified: false });
});

test("coverage rejects duplicate IDs after whitespace normalization", () => {
  assert.equal(parseGenerationCoverage({
    features: [
      { id: "farm", label: "Farm", status: "implemented" },
      { id: " farm ", label: "Other farm", status: "unavailable" },
    ],
    uiVerified: true,
  }), null);
});

test("coverage enforces feature and text bounds without silently truncating claims", () => {
  const feature = { id: "i".repeat(128), label: "l".repeat(200), status: "unavailable", reason: "r".repeat(1000) };
  assert.ok(parseGenerationCoverage({ features: [feature], uiVerified: false }));
  for (const changed of [
    { ...feature, id: "i".repeat(129) },
    { ...feature, label: "l".repeat(201) },
    { ...feature, reason: "r".repeat(1001) },
  ]) assert.equal(parseGenerationCoverage({ features: [changed], uiVerified: false }), null);

  const features = Array.from({ length: 64 }, (_, index) => ({ id: `feature-${index}`, label: `Feature ${index}`, status: "implemented" }));
  assert.equal(parseGenerationCoverage({ features, uiVerified: true })?.features.length, 64);
  assert.equal(parseGenerationCoverage({ features: [...features, { ...features[0], id: "feature-64" }], uiVerified: true }), null);
});
