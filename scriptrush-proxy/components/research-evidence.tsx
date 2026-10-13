import { researchBasisLabel, type ResearchKnowledge } from "../lib/research-knowledge";

export function ResearchEvidence({ knowledge, title = "Research used" }: { knowledge: ResearchKnowledge; title?: string }) {
  const sources = new Map(knowledge.sources.map(source => [source.id, source]));
  return <section className="panel generation-coverage research-evidence" aria-label={title}>
    <div className="panel-heading"><div><h3>{title}</h3><p>{knowledge.summary}</p></div></div>
    {knowledge.features.length > 0 ? <ul className="confidence-list">{knowledge.features.map(feature => <li className="confidence-row" key={feature.id}>
      <div><span>{feature.label}</span><p className="hint">{feature.summary}</p>
        {feature.missing?.length ? <p className="hint">Still needed: {feature.missing.join("; ")}</p> : null}
        {feature.sourceIds.length > 0 ? <p className="hint">Sources: {feature.sourceIds.map((id, index) => {
          const source = sources.get(id)!;
          return <span key={id}>{index > 0 ? " · " : ""}<a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></span>;
        })}</p> : null}
      </div><span className={`confidence-badge ${feature.basis === "runtime-verified" ? "confirmed" : feature.basis === "source-backed" ? "possible" : "weak"}`}><i aria-hidden="true" />{researchBasisLabel(feature.basis)}</span>
    </li>)}</ul> : null}
    {knowledge.sources.length > 0 ? <details className="advanced"><summary>Source references <span className="muted">{knowledge.sources.length} {knowledge.sources.length === 1 ? "reference" : "references"}</span></summary><ul className="confidence-list">{knowledge.sources.map(source => <li className="confidence-row" key={source.id}><div><a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><p className="hint">{source.kind} · {new URL(source.url).hostname}</p></div></li>)}</ul></details> : null}
    <p className="hint">Public code references explain the implementation; they do not confirm behavior in the live game.{knowledge.researchedAt ? ` Researched on ${knowledge.researchedAt.slice(0, 10)}.` : ""}</p>
  </section>;
}
