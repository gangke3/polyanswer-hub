export const PROVIDER_IDS = ["chatgpt", "gemini", "kimi", "doubao"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  homepage: string;
  loginUrl: string;
  enabled: boolean;
}
