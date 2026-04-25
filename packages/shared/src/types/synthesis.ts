import type { ProviderId } from "./provider.js";

export interface ProviderSummary {
  providerId: ProviderId;
  summary: string;
}

export interface SynthesisResult {
  id: string;
  taskId: string;
  finalAnswer: string;
  consensusPoints: string[];
  conflictPoints: string[];
  providerSummaries: ProviderSummary[];
  followUpQuestions: string[];
  method: "rule-based" | "llm";
  createdAt: string;
}
