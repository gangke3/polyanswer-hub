export interface ResultCardViewModel {
  title: string;
  body: string;
}

interface TaskSavePayload {
  question: string;
  createdAt: string;
  finishedAt?: string;
  status: string;
  providerIds: string[];
  answers: Array<{
    providerId: string;
    status: string;
    answerText?: string;
    errorMessage?: string;
  }>;
  synthesis?: { finalAnswer: string };
  autoSummary?: {
    providerId: string;
    status: string;
    answerText?: string;
    errorMessage?: string;
  };
}

interface ResummarizePayload {
  question: string;
  answers: Array<{
    providerId: string;
    status: string;
    answerText?: string;
    errorMessage?: string;
  }>;
  summaryProviderId: string;
  timeoutMs?: number;
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
      exportHistoryToText: (id: string) => Promise<{ canceled: boolean; path?: string }>;
      createTask: (
        input: import("@multi-ai/shared").CreateTaskInput
      ) => Promise<import("@multi-ai/orchestrator").TaskExecutionResult>;
      saveAllAnswers: (
        payload: { data: TaskSavePayload; format: "txt" | "md" }
      ) => Promise<{ canceled: boolean; path?: string }>;
      exportPdfTask: (
        payload: TaskSavePayload
      ) => Promise<{ canceled: boolean; path?: string }>;
      exportPdfContent: (
        payload: { title: string; body: string }
      ) => Promise<{ canceled: boolean; path?: string }>;
      resummarize: (
        payload: ResummarizePayload
      ) => Promise<import("@multi-ai/shared").ProviderRunResult>;
    };
  }
}

export {};
