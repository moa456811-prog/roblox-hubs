import test from "node:test";
import assert from "node:assert/strict";
import { capacityRetryDelay, parseProviderResetAt } from "../src/lib/provider-capacity.ts";

test("minute reset retries preserve the stage deadline and honor seconds or HTTP dates", () => {
  const now = Date.parse("2026-10-12T20:00:00Z");
  assert.equal(capacityRetryDelay("38", now, now + 60000, false), 38250);
  assert.equal(capacityRetryDelay("Mon, 12 Oct 2026 20:00:38 GMT", now, now + 60000, false), 38250);
  assert.equal(capacityRetryDelay("38", now, now + 39000, false), null);
});

test("daily limits, malformed resets and unbounded waits never cause blind retries", () => {
  for (const header of [null, "invalid", "-1", "61"]) assert.equal(capacityRetryDelay(header, 0, 300000, false), null);
  assert.equal(capacityRetryDelay("1", 0, 300000, true), null);
});

test("explicit provider reset instants accept epoch seconds, milliseconds and zoned ISO dates", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const resetAt = now + 90_000;
  assert.equal(parseProviderResetAt(String(resetAt / 1000), now), resetAt);
  assert.equal(parseProviderResetAt(` ${resetAt} `, now), resetAt);
  assert.equal(parseProviderResetAt("2026-10-13T12:01:30Z", now), resetAt);
  assert.equal(parseProviderResetAt("2026-10-13T14:01:30+02:00", now), resetAt);
  assert.equal(parseProviderResetAt("2026-10-13T12:01:30.125Z", now), resetAt + 125);
});

test("missing, ambiguous, malformed, nonfinite and expired reset values never invent a reset", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  for (const value of [null, "", " \t", "invalid", "Infinity", "NaN", "1e309", "9".repeat(400), "-1", "30", "10/14/2026", "2026-10-14T12:00:00", "2026-13-14T12:00:00Z", "2027-02-30T12:00:00Z", "2027-04-31T12:00:00Z", String(now), String(now / 1000), String(now - 1), "2026-10-12T12:00:00Z"]) {
    assert.equal(parseProviderResetAt(value, now), undefined, String(value));
  }
  assert.equal(parseProviderResetAt("2026-10-14T12:00:00Z", Infinity), undefined);
  assert.equal(parseProviderResetAt("2026-10-14T12:00:00Z", NaN), undefined);
});
