import type { CreateTaskInput } from "@multi-ai/shared";
import { TaskOrchestrator } from "@multi-ai/orchestrator";
import { appendHistoryDebugLog, getHistoryFilePath, saveHistoryItem } from "./history.ipc.js";
import { loadAppSettings } from "./settings.ipc.js";
import { sendTaskResultEmail } from "../services/email.service.js";

const orchestrator = new TaskOrchestrator();

export async function createTask(input: CreateTaskInput) {
  const settings = await loadAppSettings();
  const result = await orchestrator.run({
    ...input,
    providerSettings: settings.providers
  });

  const shouldAutoSave = input.autoSave !== false;
  await appendHistoryDebugLog(
    `task result task=${result.task.id} input.autoSave=${String(input.autoSave)} shouldAutoSave=${String(
      shouldAutoSave
    )} answers=${result.answers.length} historyPath=${getHistoryFilePath()}`
  );

  if (shouldAutoSave) {
    try {
      await saveHistoryItem({
        task: result.task,
        answers: result.answers,
        synthesis: result.synthesis,
        autoSummary: result.autoSummary,
        events: result.events
      });
    } catch (error) {
      await appendHistoryDebugLog(
        `save failed task=${result.task.id} error=${error instanceof Error ? error.message : String(error)}`
      );
      console.error(
        `[history] Failed to save task ${result.task.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  try {
    await sendTaskResultEmail(settings, {
      task: result.task,
      answers: result.answers,
      synthesis: result.synthesis,
      autoSummary: result.autoSummary
    });
    await appendHistoryDebugLog(
      `email sent task=${result.task.id} recipient=${settings.email.recipientEmail || "(empty)"}`
    );
  } catch (error) {
    await appendHistoryDebugLog(
      `email failed task=${result.task.id} error=${error instanceof Error ? error.message : String(error)}`
    );
    console.error(
      `[email] Failed to send task result for ${result.task.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return result;
}
