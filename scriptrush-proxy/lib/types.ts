export interface GameSelection {
  game: string;
  placeId: string;
}

export interface Source {
  name: string;
  content: string;
  size: number;
}

export interface RuntimeProfile extends Record<string, unknown> {
  game: {
    name?: string;
    placeId?: string | number;
    universeId?: string | number;
    [key: string]: unknown;
  };
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  type: "generated" | "fixed";
  gameName: string;
  placeId: string;
  prompt: string;
  script: string;
  sourceVersionId: string | null;
  runtimeProfileUsed: boolean;
  lineCount: number;
  characterCount: number;
}

export type HistoryInput = Omit<HistoryEntry, "id" | "createdAt" | "lineCount" | "characterCount" | "sourceVersionId" | "runtimeProfileUsed"> & {
  id?: string;
  createdAt?: string;
  sourceVersionId?: string | null;
  runtimeProfileUsed?: boolean;
};

export interface GenerationRequest extends GameSelection {
  mode: "build" | "fix";
  prompt: string;
  sources: Source[];
  currentScript?: string;
}

export interface GenerationResult {
  script: string;
  message: string;
  metadata: Record<string, unknown>;
}

export interface GenerationUsage {
  modelCalls: number;
  inputCharacters: number;
  outputCharacters: number;
}

export interface ResearchResult extends GameSelection {
  name: string;
  universeId?: string;
  profile: Record<string, unknown>;
}

export type RequestStatus = "idle" | "loading" | "success" | "error" | "cancelled";
