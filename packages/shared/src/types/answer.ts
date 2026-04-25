import type { ProviderId } from "./provider.js";

export interface ProviderAnswer {
  id: string;
  taskProviderId: string;
  providerId: ProviderId;
  question: string;
  answerText: string;
  answerMarkdown?: string;
  rawText?: string;
  rawHtmlPath?: string;
  screenshotPath?: string;
  createdAt: string;
}

export interface ProviderRunResult {
  providerId: ProviderId;
  status: "completed" | "failed" | "timeout" | "cancelled";
  answer?: ProviderAnswer;
  errorCode?: string;
  errorMessage?: string;
  elapsedMs?: number;
}
