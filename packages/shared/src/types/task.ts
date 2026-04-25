import type { ProviderId } from "./provider.js";
import type { ProviderExecutionMode, ProviderSettings } from "./settings.js";

export type TaskStatus =
  | "draft"
  | "running"
  | "partial_completed"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskProviderStatus =
  | "idle"
  | "checking_login"
  | "login_required"
  | "waiting_user_login"
  | "ready"
  | "submitting"
  | "generating"
  | "extracting"
  | "completed"
  | "failed"
  | "timeout"
  | "cancelled";

export interface CreateTaskInput {
  question: string;
  providerIds: ProviderId[];
  autoSynthesize: boolean;
  autoSave?: boolean;
  autoSummarize?: boolean;
  summaryProviderId?: ProviderId;
  timeoutMs: number;
  providerModes?: Partial<Record<ProviderId, ProviderExecutionMode>>;
  providerSettings?: Partial<Record<ProviderId, ProviderSettings>>;
}

export interface TaskRecord {
  id: string;
  question: string;
  providerIds: ProviderId[];
  autoSynthesize: boolean;
  autoSave?: boolean;
  autoSummarize?: boolean;
  summaryProviderId?: ProviderId;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface TaskProviderRecord {
  id: string;
  taskId: string;
  providerId: ProviderId;
  status: TaskProviderStatus;
  startedAt?: string;
  finishedAt?: string;
  elapsedMs?: number;
  errorCode?: string;
  errorMessage?: string;
  requiresUserAction: boolean;
}
