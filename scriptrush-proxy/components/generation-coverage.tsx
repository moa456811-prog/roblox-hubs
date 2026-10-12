import type { GenerationCoverage as Coverage } from "@/lib/coverage";

export function GenerationCoverage({ coverage }: { coverage: Coverage }) {
  return (
    <section className="panel generation-coverage" aria-label="Generation coverage">
      <div className="panel-heading">
        <div>
          <h3>Generation coverage</h3>
          <p>{coverage.uiVerified ? "Requested UI checked" : "Requested UI needs verification"}</p>
        </div>
      </div>
      {coverage.features.length > 0 ? (
        <ul className="confidence-list">
          {coverage.features.map(feature => (
            <li className="confidence-row" key={feature.id}>
              <div>
                <span>{feature.label}</span>
                {feature.status === "unavailable" ? (
                  <p className="hint">{feature.reason ?? "Explicit runtime evidence required"}</p>
                ) : feature.reason ? (
                  <p className="hint">{feature.reason}</p>
                ) : null}
              </div>
              <span className={`confidence-badge ${feature.status === "implemented" ? "confirmed" : "weak"}`}>
                <i aria-hidden="true" />
                {feature.status === "implemented" ? "Implemented" : "Needs game profile"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="hint">Static review only. In-game behavior has not been confirmed.</p>
    </section>
  );
}
