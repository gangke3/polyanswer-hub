import type { SynthesisResult } from "@multi-ai/shared";

interface SynthesisPanelProps {
  synthesis: SynthesisResult;
}

export function SynthesisPanel(props: SynthesisPanelProps) {
  return (
    <section className="panel synthesis-panel">
      <p className="eyebrow">综合答案</p>
      <p className="synthesis-text">{props.synthesis.finalAnswer}</p>
    </section>
  );
}
