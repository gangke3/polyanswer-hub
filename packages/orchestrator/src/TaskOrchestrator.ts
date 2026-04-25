import type {
  CreateTaskInput,
  ProviderExecutionMode,
  ProviderRunResult,
  ProviderId,
  TaskEvent,
  TaskRecord
} from "@multi-ai/shared";
import { createId, nowIso } from "@multi-ai/shared";
import { getProvider } from "@multi-ai/providers";
import { RuleBasedSynthesizer } from "@multi-ai/synthesizer";
import { ProviderWorker } from "./ProviderWorker.js";
import { ApiProviderWorker } from "./ApiProviderWorker.js";
import { createTaskEvent } from "./events.js";

export interface TaskExecutionResult {
  task: TaskRecord;
  answers: ProviderRunResult[];
  synthesis?: ReturnType<RuleBasedSynthesizer["synthesize"]>;
  autoSummary?: ProviderRunResult;
  events: TaskEvent[];
}

export class TaskOrchestrator {
  private readonly synthesizer = new RuleBasedSynthesizer();

  async run(input: CreateTaskInput): Promise<TaskExecutionResult> {
    const taskId = createId("task");
    const startedAt = nowIso();
    const events: TaskEvent[] = [
      createTaskEvent(taskId, "task.started", "Task started")
    ];

    const task: TaskRecord = {
      id: taskId,
      question: input.question,
      providerIds: input.providerIds,
      autoSynthesize: input.autoSynthesize,
      autoSave: input.autoSave,
      autoSummarize: input.autoSummarize,
      summaryProviderId: input.summaryProviderId,
      status: "running",
      createdAt: startedAt,
      startedAt
    };

    const answers: ProviderRunResult[] = [];

    for (const providerId of input.providerIds) {
      const provider = getProvider(providerId);
      const mode: ProviderExecutionMode =
        input.providerModes?.[providerId] ?? input.providerSettings?.[providerId]?.mode ?? "browser";
      const worker = mode === "api" ? new ApiProviderWorker(provider) : new ProviderWorker(provider);

      events.push(
        createTaskEvent(taskId, "provider.started", `${provider.name} started in ${mode} mode`, providerId)
      );

      const result = await worker.run(
        {
          taskId,
          providerId,
          profilePath: `data/sessions/${providerId}`,
          timeoutMs: this.resolveProviderTimeout(providerId, input.timeoutMs, mode),
          visible: mode !== "api",
          mode,
          settings: input.providerSettings?.[providerId]
        },
        input.question
      );

      events.push(
        createTaskEvent(
          taskId,
          "provider.completed",
          `${provider.name} finished with ${result.status}`,
          providerId
        )
      );

      answers.push(result);
    }

    const synthesis = input.autoSynthesize ? this.synthesizer.synthesize(taskId, answers) : undefined;
    const autoSummary = input.autoSummarize
      ? await this.runAutoSummary(taskId, input, answers, events)
      : undefined;
    const completedCount = answers.filter((item) => item.status === "completed").length;
    const failedCount = answers.length - completedCount;
    const finalStatus =
      completedCount === 0
        ? "failed"
        : failedCount === 0
          ? "completed"
          : "partial_completed";

    return {
      task: {
        ...task,
        status: finalStatus,
        finishedAt: nowIso()
      },
      answers,
      synthesis,
      autoSummary,
      events
    };
  }

  private async runAutoSummary(
    taskId: string,
    input: CreateTaskInput,
    answers: ProviderRunResult[],
    events: TaskEvent[]
  ): Promise<ProviderRunResult | undefined> {
    const summaryProviderId = input.summaryProviderId ?? input.providerIds[0];
    if (!summaryProviderId) {
      return undefined;
    }

    const completedAnswers = answers.filter((item) => item.status === "completed" && item.answer?.answerText);
    if (completedAnswers.length === 0) {
      return {
        providerId: summaryProviderId,
        status: "failed",
        errorCode: "NO_COMPLETED_ANSWERS",
        errorMessage: "No completed provider answers are available for summarization."
      };
    }

    const provider = getProvider(summaryProviderId);
    const worker = new ProviderWorker(provider);
    const prompt = this.createSummaryPrompt(input.question, completedAnswers);

    events.push(
      createTaskEvent(taskId, "summary.started", `${provider.name} started summarizing answers`, summaryProviderId)
    );

    const result = await worker.run(
      {
        taskId,
        providerId: summaryProviderId,
        profilePath: `data/sessions/${summaryProviderId}`,
        timeoutMs: this.resolveProviderTimeout(summaryProviderId, input.timeoutMs, "browser"),
        visible: true,
        mode: "browser",
        forceNewPage: true,
        settings: input.providerSettings?.[summaryProviderId]
      },
      prompt
    );

    events.push(
      createTaskEvent(
        taskId,
        "summary.completed",
        `${provider.name} finished summarizing with ${result.status}`,
        summaryProviderId
      )
    );

    return result;
  }

  private createSummaryPrompt(question: string, answers: ProviderRunResult[]): string {
    const answerBlocks = answers
      .map((item, index) => {
        const label = item.providerId;
        const text = item.answer?.answerText?.trim() ?? "";
        return `## Answer ${index + 1}: ${label}\n${text}`;
      })
      .join("\n\n");

    return [
      "请对下面同一个问题的多个 AI 回答进行总结。",
      "要求：",
      "1. 先给出一个简洁、完整的最终总结。",
      "2. 提炼各回答一致的关键结论。",
      "3. 标出回答之间明显不同或互相矛盾的地方。",
      "4. 不要逐字复述原文，优先输出结构清晰的中文总结。",
      "",
      `原始问题：${question}`,
      "",
      "全部回答：",
      answerBlocks
    ].join("\n");
  }

  private resolveProviderTimeout(
    providerId: ProviderId,
    timeoutMs: number,
    mode: ProviderExecutionMode
  ): number {
    if (mode === "api") {
      return timeoutMs;
    }

    switch (providerId) {
      case "doubao":
        return Math.max(timeoutMs, 240000);
      case "gemini":
        return Math.max(timeoutMs, 150000);
      default:
        return Math.max(timeoutMs, 120000);
    }
  }
}
