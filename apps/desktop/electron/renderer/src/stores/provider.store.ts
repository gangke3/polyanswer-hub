export interface ProviderStoreState {
  selectedProviderIds: string[];
}

export const providerStore: ProviderStoreState = {
  selectedProviderIds: ["chatgpt", "claude", "gemini", "kimi", "doubao"]
};
