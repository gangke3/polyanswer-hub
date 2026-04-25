import type { ProviderRunResult, SynthesisResult } from "@multi-ai/shared";

export class LlmSynthesizer {
  async synthesize(_taskId: string, _results: ProviderRunResult[]): Promise<SynthesisResult> {
    throw new Error("LLM synthesizer not implemented yet");
  }
}

