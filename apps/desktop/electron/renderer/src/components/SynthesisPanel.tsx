import type { SynthesisResult } from "@multi-ai/shared";

interface SynthesisPanelProps {
  synthesis: SynthesisResult;
  label?: string;
}

export function SynthesisPanel(props: SynthesisPanelProps) {
  const handleSave = (format: 'txt' | 'md' | 'pdf') => {
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
      const printWindow = window.open('', '', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Answer</title>
              <style>
                body { font-family: sans-serif; padding: 20px; white-space: pre-wrap; line-height: 1.6; }
              </style>
            </head>
            <body></body>
          </html>
        `);
        printWindow.document.body.textContent = text;
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
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
