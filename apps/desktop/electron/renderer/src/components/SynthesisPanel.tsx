import type { SynthesisResult } from "@multi-ai/shared";

interface SynthesisPanelProps {
  synthesis: SynthesisResult;
  label?: string;
}

export function SynthesisPanel(props: SynthesisPanelProps) {
  const handleSave = async (format: 'txt' | 'md' | 'pdf') => {
    const text = props.synthesis.finalAnswer;
    
    if (format === 'txt' || format === 'md') {
      const blob = new Blob([text], { type: format === 'md' ? 'text/markdown' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `answer.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
      try {
        await window.multiAiApi.exportPdfContent({ title: props.label ?? "综合答案", body: text });
      } catch (err) {
        console.error("PDF export failed:", err);
      }
    }
  };

  return (
    <section className="panel synthesis-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p className="eyebrow" style={{ margin: 0 }}>{props.label ?? "综合答案"}</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="secondary-button" style={{ fontSize: '12px', padding: '4px 8px', minHeight: 'auto' }} onClick={() => handleSave('txt')}>保存为 TXT</button>
          <button className="secondary-button" style={{ fontSize: '12px', padding: '4px 8px', minHeight: 'auto' }} onClick={() => handleSave('md')}>保存为 MD</button>
          <button className="secondary-button" style={{ fontSize: '12px', padding: '4px 8px', minHeight: 'auto' }} onClick={() => handleSave('pdf')}>保存为 PDF</button>
        </div>
      </div>
      <p className="synthesis-text">{props.synthesis.finalAnswer}</p>
    </section>
  );
}
