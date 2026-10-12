export type GenerationFeatureStatus = "implemented" | "unavailable";

export interface GenerationFeatureCoverage {
  id: string;
  label: string;
  status: GenerationFeatureStatus;
  reason?: string;
}

export interface GenerationCoverage {
  features: GenerationFeatureCoverage[];
  uiVerified: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length > maxLength) return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

export function parseGenerationCoverage(value: unknown): GenerationCoverage | null {
  if (!isRecord(value) || typeof value.uiVerified !== "boolean" || !Array.isArray(value.features) || value.features.length > 64) return null;

  const features: GenerationFeatureCoverage[] = [];
  const ids = new Set<string>();

  for (const feature of value.features) {
    if (!isRecord(feature)) return null;
    const id = boundedText(feature.id, 128);
    const label = boundedText(feature.label, 200);
    const status = feature.status;
    if (id === null || label === null || (status !== "implemented" && status !== "unavailable") || ids.has(id)) return null;

    const entry: GenerationFeatureCoverage = { id, label, status };
    if (feature.reason !== undefined) {
      const reason = boundedText(feature.reason, 1000);
      if (reason === null) return null;
      entry.reason = reason;
    }

    ids.add(id);
    features.push(entry);
  }

  return { features, uiVerified: value.uiVerified };
}
