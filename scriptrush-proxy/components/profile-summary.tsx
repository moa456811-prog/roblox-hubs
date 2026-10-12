import { FeatureConfidence } from "./feature-confidence";
import { Icon } from "./icon";
import { EmptyState } from "./empty-state";

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function display(value: unknown): string { return typeof value === "string" && value.trim() ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "—"; }
function count(value: unknown, list?: unknown): string { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value.toLocaleString() : Array.isArray(list) ? list.length.toLocaleString() : "—"; }
function date(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "—";
  const parsed = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ProfileSummary({ profile }: { profile: unknown }) {
  const data = record(profile);
  if (!Object.keys(data).length) return <EmptyState title="No game profile loaded" description="Import a scanner report to see the information it observed." icon="scan" />;
  const game = record(data.game);
  const scan = record(data.scan);
  const counts = record(scan.counts ?? data.counts);
  const npcList = scan.npcs ?? data.npcs;
  const bosses = typeof counts.bosses === "number" ? counts.bosses : Array.isArray(npcList) && npcList.every(item => typeof record(item).bossCandidate === "boolean") ? npcList.filter(item => record(item).bossCandidate === true).length : undefined;
  const stats = [{ label: "NPC candidates", value: count(counts.npcs, npcList) }, { label: "Boss candidates", value: count(bosses) }, { label: "Prompts", value: count(counts.prompts, scan.prompts ?? data.prompts) }, { label: "Tools", value: count(counts.tools, scan.tools ?? data.tools) }, { label: "GUI elements", value: count(counts.gui, scan.gui ?? data.gui) }, { label: "Visible remotes", value: count(counts.remotes, scan.remotes ?? data.remotes) }];
  return <div className="profile-summary"><div className="profile-summary-heading"><div className="profile-icon"><Icon name="scan" size={22} /></div><div><span className="eyebrow">IMPORTED GAME PROFILE</span><h3>{display(game.name ?? game.gameName) === "—" ? "Game profile" : display(game.name ?? game.gameName)}</h3></div><span className="status-pill"><Icon name="check" size={13} />Loaded</span></div><dl className="profile-details"><div><dt>Place ID</dt><dd>{display(game.placeId)}</dd></div><div><dt>Universe ID</dt><dd>{display(game.universeId)}</dd></div><div><dt>Scan mode</dt><dd className="capitalize">{display(scan.mode ?? data.mode)}</dd></div><div><dt>Scanned</dt><dd>{date(scan.scannedAt ?? data.generatedAt)}</dd></div></dl><div className="profile-stats">{stats.map(stat => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div><FeatureConfidence features={data.features} /></div>;
}

export default ProfileSummary;
