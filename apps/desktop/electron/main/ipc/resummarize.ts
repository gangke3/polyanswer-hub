import type { ProviderRunResult, ProviderId } from "@multi-ai/shared";
import { createId, nowIso } from "@multi-ai/shared";
import { getProvider } from "@multi-ai/providers";
import { ProviderWorker } from "@multi-ai/orchestrator";
import { loadAppSettings } from "./settings.ipc.js";

export interface ResummarizeInput {
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

function buildSummaryPrompt(question: string, answers: ProviderRunResult[]): string {
  const MAX_PER_ANSWER = 3000;

  const answerBlocks = answers
    .map((item, index) => {
      const label = item.providerId;
      const fullText = item.answer?.answerText?.trim() ?? "";
      const text = fullText.length > MAX_PER_ANSWER
        ? fullText.slice(0, MAX_PER_ANSWER) + "\n...[截断，原文太长]"
        : fullText;
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

function resolveProviderTimeout(providerId: ProviderId, timeoutMs: number): number {
  switch (providerId) {
    case "claude":
      return Math.max(timeoutMs, 180000);
    case "doubao":
      return Math.max(timeoutMs, 240000);
    case "kimi":
      return Math.max(timeoutMs, 240000);
    case "gemini":
      return Math.max(timeoutMs, 150000);
    default:
      return Math.max(timeoutMs, 120000);
  }
}

export async function resummarize(input: ResummarizeInput): Promise<ProviderRunResult> {
  const settings = await loadAppSettings();
  const summaryProviderId = input.summaryProviderId as ProviderId;

  // Convert input answers to ProviderRunResult format
  const answers: ProviderRunResult[] = input.answers.map((a) => ({
    providerId: a.providerId as ProviderId,
    status: (a.status as ProviderRunResult["status"]) ?? "failed",
    answer: a.answerText
      ? {
          id: createId("ans"),
          taskProviderId: `${createId("tp")}`,
          providerId: a.providerId as ProviderId,
          question: input.question,
          answerText: a.answerText,
          createdAt: nowIso()
        }
      : undefined,
    errorMessage: a.errorMessage
  }));

  const completedAnswers = answers.filter(
    (item) => item.status === "completed" && item.answer?.answerText
  );

  if (completedAnswers.length === 0) {
    return {
      providerId: summaryProviderId,
      status: "failed",
      errorCode: "NO_COMPLETED_ANSWERS",
      errorMessage: "没有可用的已完成答案来进行总结。"
    };
  }

  const provider = getProvider(summaryProviderId);
  const worker = new ProviderWorker(provider);
  const prompt = buildSummaryPrompt(input.question, completedAnswers);
  const taskId = createId("resum");
  const timeoutMs = input.timeoutMs ?? 240000;

  console.log(`[resummarize] Using ${provider.name} to summarize ${completedAnswers.length} answers`);

  const result = await worker.run(
    {
      taskId,
      providerId: summaryProviderId,
      profilePath: `data/sessions/${summaryProviderId}`,
      timeoutMs: resolveProviderTimeout(summaryProviderId, timeoutMs),
      visible: true,
      settings: settings.providers[summaryProviderId]
    },
    prompt
  );

  console.log(`[resummarize] Summary completed with status: ${result.status}`);
  return result;
}
