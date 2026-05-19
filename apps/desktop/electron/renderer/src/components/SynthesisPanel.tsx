import type { SynthesisResult } from "@multi-ai/shared";

interface SynthesisPanelProps {
  synthesis: SynthesisResult;
  label?: string;
}

export function SynthesisPanel(props: SynthesisPanelProps) {
  return (
    <section className="panel synthesis-panel">
      <p className="eyebrow">{props.label ?? "综合答案"}</p>
      <p className="synthesis-text">{props.synthesis.finalAnswer}</p>
    </section>
  );
}
