import type { ProviderRunResult } from "@multi-ai/shared";

export function exportTxt(question: string, answers: ProviderRunResult[]): string {
  return [
    `Question: ${question}`,
    "",
    ...answers.map((answer) => `${answer.providerId}\n${answer.answer?.answerText ?? answer.status}\n`)
  ].join("\n");
}

