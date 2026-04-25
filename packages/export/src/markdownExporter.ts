import type { ProviderRunResult, SynthesisResult } from "@multi-ai/shared";

export function exportMarkdown(question: string, answers: ProviderRunResult[], synthesis?: SynthesisResult): string {
  const sections = ["# Question", "", question, "", "# Provider Answers", ""];

  for (const answer of answers) {
    sections.push(`## ${answer.providerId}`);
    sections.push("");
    sections.push(answer.answer?.answerText ?? `Status: ${answer.status}`);
    sections.push("");
  }

  if (synthesis) {
    sections.push("# Final Answer");
    sections.push("");
    sections.push(synthesis.finalAnswer);
    sections.push("");
  }

  return sections.join("\n");
}

