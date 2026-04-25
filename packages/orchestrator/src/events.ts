import { createId, nowIso, type ProviderId, type TaskEvent } from "@multi-ai/shared";

export function createTaskEvent(
  taskId: string,
  eventType: string,
  message: string,
  providerId?: ProviderId,
  payload?: Record<string, unknown>
): TaskEvent {
  return {
    id: createId("event"),
    taskId,
    providerId,
    level: "info",
    eventType,
    message,
    createdAt: nowIso(),
    payload
  };
}

