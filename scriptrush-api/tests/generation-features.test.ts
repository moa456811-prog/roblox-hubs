import test from "node:test";
import assert from "node:assert/strict";
import { requestedFeatures } from "../src/lib/generation-jobs/requested-features.ts";

test("explicit requirements and UI constraints enter the inventory independently", () => {
  const features = requestedFeatures("- Auto Farm\n- Auto Quest\n- Dark UI with purple tabs\n- Exact title: My Hub");
  for (const expected of ["Auto Farm", "Auto Quest", "Dark UI with purple tabs", "Exact title: My Hub"]) assert.ok(features.includes(expected));
  assert.equal(features.filter(value => value.toLowerCase() === "auto farm").length, 1);
});
test("bare full hub request never invents a list of game capabilities", () => {
  assert.deepEqual(requestedFeatures("Full Hub"), ["Full Hub"]);
  assert.deepEqual(requestedFeatures("Répare seulement cette erreur"), ["Répare seulement cette erreur"]);
});
test("prose with explicit known features keeps each named requirement", () => {
  const prose = "I need Auto Farm and Auto Quest with WalkSpeed and English UI";
  assert.deepEqual(requestedFeatures(prose), [prose, "Auto Farm", "Auto Quest", "WalkSpeed", "English UI"]);
  assert.ok(requestedFeatures("Cooldown; character lifecycle; cleanup").includes("character lifecycle"));
});
test("inventory remains bounded and does not normalize away custom names", () => {
  assert.equal(requestedFeatures(Array.from({ length: 50 }, (_, n) => `Feature ${n}`).join(";")).length, 32);
  assert.deepEqual(requestedFeatures("Titre personnalisé: Ω [My Exact Name]"), ["Titre personnalisé: Ω [My Exact Name]"]);
});
