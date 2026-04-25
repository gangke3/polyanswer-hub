import type { ProviderRunResult } from "./answer.js";
import type { TaskEvent } from "./events.js";
import type { SynthesisResult } from "./synthesis.js";
import type { TaskRecord } from "./task.js";

export interface SavedTaskHistoryItem {
  id: string;
  savedAt: string;
  task: TaskRecord;
  answers: ProviderRunResult[];
  synthesis?: SynthesisResult;
  autoSummary?: ProviderRunResult;
  events: TaskEvent[];
}
