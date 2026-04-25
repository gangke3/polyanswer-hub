export interface ResultCardViewModel {
  title: string;
  body: string;
}

declare global {
  interface Window {
    multiAiApi: {
      listProviders: () => Promise<import("@multi-ai/shared").ProviderMeta[]>;
      openProviderLoginPages: (
        providerIds?: string[]
      ) => Promise<{ opened: number; providerIds: string[] }>;
      getSettings: () => Promise<import("@multi-ai/shared").AppSettings>;
      saveSettings: (
        settings: import("@multi-ai/shared").AppSettings
      ) => Promise<import("@multi-ai/shared").AppSettings>;
      updateProviderSettings: (
        providerId: import("@multi-ai/shared").ProviderId,
        patch: Partial<import("@multi-ai/shared").ProviderSettings>
      ) => Promise<import("@multi-ai/shared").AppSettings>;
      listHistory: () => Promise<import("@multi-ai/shared").SavedTaskHistoryItem[]>;
      deleteHistory: (id: string) => Promise<import("@multi-ai/shared").SavedTaskHistoryItem[]>;
      clearHistory: () => Promise<import("@multi-ai/shared").SavedTaskHistoryItem[]>;
      createTask: (
        input: import("@multi-ai/shared").CreateTaskInput
      ) => Promise<import("@multi-ai/orchestrator").TaskExecutionResult>;
    };
  }
}

export {};
