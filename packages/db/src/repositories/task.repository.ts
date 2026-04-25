import type {
  CreateTaskInput,
  ProviderRunResult,
  SynthesisResult,
  TaskRecord
} from "@multi-ai/shared";
import { createId, nowIso } from "@multi-ai/shared";

export class TaskRepository {
  createDraft(input: CreateTaskInput): TaskRecord {
    return {
      id: createId("task"),
      question: input.question,
      providerIds: input.providerIds,
      autoSynthesize: input.autoSynthesize,
      status: "draft",
      createdAt: nowIso()
    };
  }

  attachResults(task: TaskRecord, _results: ProviderRunResult[], _synthesis?: SynthesisResult): TaskRecord {
    return {
      ...task,
      status: "completed",
      finishedAt: nowIso()
    };
  }
}

