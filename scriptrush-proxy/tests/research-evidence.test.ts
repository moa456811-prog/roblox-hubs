import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { transpileModule, JsxEmit, ModuleKind, ScriptTarget } from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { parseResearchKnowledge, researchBasisLabel, type ResearchKnowledge } from "../lib/research-knowledge.ts";

async function component() {
  const source = readFileSync(new URL("../components/research-evidence.tsx", import.meta.url), "utf8");
  const output = transpileModule(source, { compilerOptions: { jsx: JsxEmit.ReactJSX, module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
  const key = `__scriptrushResearchEvidence_${randomUUID().replaceAll("-", "")}`;
  const registry = globalThis as unknown as Record<string, unknown>;
  registry[key] = { jsxRuntime, researchBasisLabel };
  const injected = output.replace(/^import .*? from ["']react\/jsx-runtime["'];\r?\n/m, `const { jsx: _jsx, jsxs: _jsxs } = globalThis[${JSON.stringify(key)}].jsxRuntime;\n`)
    .replace(/^import .*? from ["']\.\.\/lib\/research-knowledge["'];\r?\n/m, `const { researchBasisLabel } = globalThis[${JSON.stringify(key)}];\n`);
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`) as { ResearchEvidence(props: { knowledge: ResearchKnowledge; title?: string }): React.ReactNode };
    return { render: (knowledge: ResearchKnowledge) => renderToStaticMarkup(module.ResearchEvidence({ knowledge })), dispose: () => { delete registry[key]; } };
  } catch (error) { delete registry[key]; throw error; }
}

const revision = "a".repeat(40), sha256 = "b".repeat(64);
const sourceAnalysis = [{ id: "source-note", basis: "source-observed", summary: "Original descriptive notes only.", observations: ['Observed lobby and combat contexts; <script>alert("unsafe")</script> remains plain text.'], provenance: { url: `https://github.com/example/game/blob/${revision}/main.luau`, revision, sha256 }, license: "UNKNOWN", reusePolicy: "analysis-only", runtimeVerified: false }];
const knowledge = { summary: "No licensed implementation has been established.", sources: [], features: [{ id: "farm", label: "Auto Farm", basis: "unknown", summary: "A real implementation is still needed.", sourceIds: [] }], sourceAnalysis };

test("source observations render separately from supported gameplay with exact provenance and unknown licence", async () => {
  const view = await component();
  try {
    const normalized = parseResearchKnowledge(knowledge)!; assert.ok(normalized);
    const html = view.render(normalized);
    assert.match(html, /Source observations · not tested in game/); assert.match(html, /Needs evidence/);
    assert.match(html, /License unknown · analysis only; no source code copied/);
    assert.ok(html.includes(`href="${sourceAnalysis[0].provenance.url}"`)); assert.ok(html.includes(`title="${revision}"`)); assert.ok(html.includes(`title="${sha256}"`));
    assert.match(html, /rel="noopener noreferrer"/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|In-game verified|Source-backed|class="confidence-badge confirmed"/);
  } finally { view.dispose(); }
});

test("the existing research panel stays unchanged when optional source observations are absent", async () => {
  const view = await component();
  try {
    const { sourceAnalysis: ignored, ...legacy } = knowledge; void ignored;
    const html = view.render(parseResearchKnowledge(legacy)!);
    assert.match(html, /Needs evidence/); assert.doesNotMatch(html, /Source observations|License unknown|View pinned source/);
    assert.match(html, /Public code references explain the implementation/);
  } finally { view.dispose(); }
});
