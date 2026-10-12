import { Icon } from "./icon";

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
const expected = [{ key: "farm", name: "Auto Farm" }, { key: "quest", name: "Auto Quest" }, { key: "boss", name: "Auto Boss" }, { key: "loot", name: "Auto Loot" }, { key: "fishing", name: "Fishing" }, { key: "sell", name: "Auto Sell" }, { key: "dungeon", name: "Dungeon" }, { key: "skills", name: "Skills" }];
const statuses: Record<string, { label: string; className: string }> = { high: { label: "Confirmed", className: "confirmed" }, confirmed: { label: "Confirmed", className: "confirmed" }, medium: { label: "Possible", className: "possible" }, possible: { label: "Possible", className: "possible" }, low: { label: "Weak evidence", className: "weak" }, weak: { label: "Weak evidence", className: "weak" }, "weak evidence": { label: "Weak evidence", className: "weak" }, none: { label: "Not detected", className: "not-detected" }, "not detected": { label: "Not detected", className: "not-detected" } };

export function FeatureConfidence({ features }: { features?: unknown }) {
  const entries: Record<string, unknown>[] = Array.isArray(features) ? features.filter(isRecord) : isRecord(features) ? Object.entries(features).map(([key, value]) => isRecord(value) ? { ...value, key } : { key, confidence: value }) : [];
  return <div className="feature-confidence"><div className="section-label"><Icon name="layers" size={16} /><h3>Feature evidence</h3></div><div className="confidence-list">{expected.map(feature => {
    const entry = entries.find(item => item.key === feature.key || (typeof item.label === "string" && item.label.toLowerCase() === feature.name.toLowerCase()));
    const status = typeof entry?.confidence === "string" ? statuses[entry.confidence.toLowerCase()] : undefined;
    const evidence = Array.isArray(entry?.evidence) ? entry.evidence.filter((value): value is string => typeof value === "string").join(" · ") : undefined;
    return <div className="confidence-row" key={feature.key} title={evidence}><span>{feature.name}</span><span className={`confidence-badge ${status?.className ?? "unknown"}`}><i />{status?.label ?? "Not provided"}</span></div>;
  })}</div><p className="hint">Evidence from your report. Detection does not guarantee a working automation.</p></div>;
}

export default FeatureConfidence;
