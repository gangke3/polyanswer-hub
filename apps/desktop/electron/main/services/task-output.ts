import { type ProviderId, type ProviderRunResult, type SavedTaskHistoryItem, type SynthesisResult, type TaskRecord } from "@multi-ai/shared";
import { BRAND } from "../../common/brand.js";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  kimi: "Kimi",
  doubao: "Doubao",
  grok: "Grok"
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    running: "运行中",
    partial_completed: "部分完成",
    cancelled: "已取消",
    draft: "草稿",
    timeout: "超时"
  };

  return labels[status] ?? status;
}

function formatAnswerBody(answer: ProviderRunResult): string {
  if (answer.answer?.answerText) {
    return answer.answer.answerText;
  }

  if (answer.errorMessage) {
    return answer.errorMessage;
  }

  return `状态：${statusLabel(answer.status)}`;
}

function providerName(providerId: ProviderId): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

function formatProviderList(results: ProviderRunResult[], fallback = "无"): string {
  if (results.length === 0) {
    return fallback;
  }

  return results.map((answer) => providerName(answer.providerId)).join("、");
}

function formatResultSummary(answers: ProviderRunResult[]): string[] {
  const completed = answers.filter((answer) => answer.status === "completed");
  const failed = answers.filter((answer) => answer.status !== "completed");

  return [
    `返回结果：${answers.length} 个`,
    `成功平台：${completed.length} 个（${formatProviderList(completed)}）`,
    `失败平台：${failed.length} 个（${formatProviderList(failed)}）`
  ];
}

function formatPreferredSummary(input: {
  synthesis?: SynthesisResult;
  autoSummary?: ProviderRunResult;
}): string[] {
  if (input.autoSummary) {
    return [
      `综合答案：${PROVIDER_LABELS[input.autoSummary.providerId] ?? input.autoSummary.providerId}`,
      "",
      formatAnswerBody(input.autoSummary),
      "",
      "----------------------------------------",
      ""
    ];
  }

  if (input.synthesis) {
    return ["综合结论", "", input.synthesis.finalAnswer, "", "----------------------------------------", ""];
  }

  return [];
}

export function formatTaskResultText(input: {
  task: TaskRecord;
  answers: ProviderRunResult[];
  synthesis?: SynthesisResult;
  autoSummary?: ProviderRunResult;
  savedAt?: string;
}): string {
  const header = [
    BRAND.taskRecordTitle,
    "",
    `问题：${input.task.question}`,
    `创建时间：${input.task.createdAt}`,
    `完成时间：${input.task.finishedAt ?? "未完成"}`,
    input.savedAt ? `保存时间：${input.savedAt}` : null,
    `任务状态：${statusLabel(input.task.status)}`,
    ...formatResultSummary(input.answers),
    `平台：${input.task.providerIds.map((providerId) => providerName(providerId)).join("、")}`,
    ""
  ].filter(Boolean);

  const summarySection = formatPreferredSummary(input);

  const providerSections = input.answers.flatMap((answer, index) => {
    const name = providerName(answer.providerId);

    return [
      `平台 ${index + 1}：${name}`,
      `状态：${statusLabel(answer.status)}`,
      "",
      formatAnswerBody(answer),
      "",
      "----------------------------------------",
      ""
    ];
  });

  return [...header, ...summarySection, ...providerSections].join("\n");
}

export function formatTaskResultMarkdown(input: {
  task: TaskRecord;
  answers: ProviderRunResult[];
  synthesis?: SynthesisResult;
  autoSummary?: ProviderRunResult;
  savedAt?: string;
}): string {
  const lines: string[] = [];
  lines.push(`# ${BRAND.taskRecordTitle}`);
  lines.push("");
  lines.push(`**问题：** ${input.task.question}`);
  lines.push("");
  lines.push(`| 字段 | 值 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| 创建时间 | ${input.task.createdAt} |`);
  lines.push(`| 完成时间 | ${input.task.finishedAt ?? "未完成"} |`);
  if (input.savedAt) lines.push(`| 保存时间 | ${input.savedAt} |`);
  lines.push(`| 任务状态 | ${statusLabel(input.task.status)} |`);

  const completed = input.answers.filter((a) => a.status === "completed");
  const failed = input.answers.filter((a) => a.status !== "completed");
  lines.push(`| 返回结果 | ${input.answers.length} 个 |`);
  lines.push(`| 成功平台 | ${completed.length} 个（${formatProviderList(completed)}） |`);
  lines.push(`| 失败平台 | ${failed.length} 个（${formatProviderList(failed)}） |`);
  lines.push(`| 平台 | ${input.task.providerIds.map((id) => providerName(id)).join("、")} |`);
  lines.push("");

  // Synthesis / auto-summary
  if (input.autoSummary) {
    const name = PROVIDER_LABELS[input.autoSummary.providerId] ?? input.autoSummary.providerId;
    lines.push(`## 综合答案 - ${name}`);
    lines.push("");
    lines.push(formatAnswerBody(input.autoSummary));
    lines.push("");
    lines.push("---");
    lines.push("");
  } else if (input.synthesis) {
    lines.push("## 综合结论");
    lines.push("");
    lines.push(input.synthesis.finalAnswer);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Per-provider sections
  for (let i = 0; i < input.answers.length; i++) {
    const answer = input.answers[i];
    const name = providerName(answer.providerId);
    lines.push(`## 平台 ${i + 1}：${name}`);
    lines.push("");
    lines.push(`**状态：** ${statusLabel(answer.status)}`);
    lines.push("");
    lines.push(formatAnswerBody(answer));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function formatHistoryItemMarkdown(item: SavedTaskHistoryItem): string {
  return formatTaskResultMarkdown({
    task: item.task,
    answers: item.answers,
    synthesis: item.synthesis,
    autoSummary: item.autoSummary,
    savedAt: item.savedAt
  });
}

export function formatHistoryItemText(item: SavedTaskHistoryItem): string {
  return formatTaskResultText({
    task: item.task,
    answers: item.answers,
    synthesis: item.synthesis,
    autoSummary: item.autoSummary,
    savedAt: item.savedAt
  });
}

export function createSuggestedTaskFileName(question: string, savedAt?: string, ext = "txt"): string {
  const timestampSource = savedAt ? new Date(savedAt) : new Date();
  const timestamp = [
    timestampSource.getFullYear(),
    String(timestampSource.getMonth() + 1).padStart(2, "0"),
    String(timestampSource.getDate()).padStart(2, "0"),
    String(timestampSource.getHours()).padStart(2, "0"),
    String(timestampSource.getMinutes()).padStart(2, "0"),
    String(timestampSource.getSeconds()).padStart(2, "0")
  ].join("");
  const safeQuestion = question
    .replace(/[<>:"/\\|?*]/g, " ")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);

  return `${safeQuestion || "task"}-${timestamp}.${ext}`;
}
