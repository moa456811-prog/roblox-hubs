import test from "node:test";
import assert from "node:assert/strict";
import { capacityRetryDelay } from "../src/lib/provider-capacity.ts";

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
