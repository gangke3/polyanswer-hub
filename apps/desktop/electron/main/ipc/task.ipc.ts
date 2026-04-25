import type { CreateTaskInput } from "@multi-ai/shared";
import { TaskOrchestrator } from "@multi-ai/orchestrator";
import { saveHistoryItem } from "./history.ipc.js";
import { loadAppSettings } from "./settings.ipc.js";

const orchestrator = new TaskOrchestrator();

export async function createTask(input: CreateTaskInput) {
  const settings = await loadAppSettings();
  const result = await orchestrator.run({
    ...input,
    providerSettings: settings.providers
  });

  if (input.autoSave) {
    await saveHistoryItem({
      task: result.task,
      answers: result.answers,
      synthesis: result.synthesis,
      autoSummary: result.autoSummary,
      events: result.events
    });
  }

  return result;
}
