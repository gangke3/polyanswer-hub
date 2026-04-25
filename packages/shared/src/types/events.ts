import type { ProviderId } from "./provider.js";
import type { TaskProviderStatus, TaskStatus } from "./task.js";

export interface TaskEvent {
  id: string;
  taskId: string;
  providerId?: ProviderId;
  level: "debug" | "info" | "warn" | "error";
  eventType: string;
  message: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface TaskStateSnapshot {
  taskId: string;
  status: TaskStatus;
  providerStatuses: Partial<Record<ProviderId, TaskProviderStatus>>;
}
