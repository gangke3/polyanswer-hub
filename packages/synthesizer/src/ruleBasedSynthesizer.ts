import { createId, nowIso, type ProviderRunResult, type SynthesisResult } from "@multi-ai/shared";

export class RuleBasedSynthesizer {
  synthesize(taskId: string, results: ProviderRunResult[]): SynthesisResult {
    const completed = results.filter((result) => result.answer);
    const summaries = completed.map((result) => ({
      providerId: result.providerId,
      summary: result.answer?.answerText.slice(0, 240) ?? ""
    }));

    return {
      id: createId("syn"),
      taskId,
      finalAnswer: completed.length
        ? completed.map((result) => `${result.providerId}: ${result.answer?.answerText ?? ""}`).join("\n\n")
        : "No provider completed successfully.",
      consensusPoints: completed.length ? ["All completed answers are shown for manual comparison."] : [],
      conflictPoints: [],
      providerSummaries: summaries,
      followUpQuestions: completed.length ? ["Ask a narrower follow-up to resolve any disagreements."] : [],
      method: "rule-based",
      createdAt: nowIso()
    };
  }
}

