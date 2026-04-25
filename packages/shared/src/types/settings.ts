import type { ProviderId } from "./provider.js";

export type ProviderExecutionMode = "api" | "browser";

export interface ProviderSettings {
  providerId: ProviderId;
  mode: ProviderExecutionMode;
  apiKey: string;
  apiBaseUrl?: string;
  model?: string;
}

export interface AppSettings {
  providers: Record<ProviderId, ProviderSettings>;
}

