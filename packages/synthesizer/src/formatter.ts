import type { SynthesisResult } from "@multi-ai/shared";

export function formatSynthesisMarkdown(result: SynthesisResult): string {
  return [
    "# Final Answer",
    "",
    result.finalAnswer,
    "",
    "## Consensus",
    ...result.consensusPoints.map((point) => `- ${point}`),
    "",
    "## Conflicts",
    ...result.conflictPoints.map((point) => `- ${point}`)
  ].join("\n");
}

