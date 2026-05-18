export const PROVIDER_IDS = ["chatgpt", "claude", "gemini", "kimi", "doubao", "grok"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  homepage: string;
  loginUrl: string;
  enabled: boolean;
}
