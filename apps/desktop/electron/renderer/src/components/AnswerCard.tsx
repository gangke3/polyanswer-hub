interface AnswerCardProps {
  title: string;
  status: string;
  statusText?: string;
  body: string;
}

function displayStatus(status: string) {
  const labels: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    running: "运行中",
    partial_completed: "部分完成",
    cancelled: "已取消",
    timeout: "超时"
  };

  return labels[status] ?? status;
}

export function AnswerCard(props: AnswerCardProps) {
  const isError = props.status !== "completed";

  const handleSave = (format: 'txt' | 'md' | 'pdf') => {
    const text = props.body;
    
    if (format === 'txt' || format === 'md') {
      const blob = new Blob([text], { type: format === 'md' ? 'text/markdown' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${props.title}.${format}`;
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
              <title>${props.title}</title>
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
    <article className={`answer-card${isError ? " answer-card-error" : ""}`}>
      <div className="answer-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3>{props.title}</h3>
          <span className="pill">{props.statusText ?? displayStatus(props.status)}</span>
        </div>
        {!isError && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="secondary-button" style={{ fontSize: '12px', padding: '4px 8px', minHeight: 'auto' }} onClick={() => handleSave('txt')}>保存为 TXT</button>
            <button className="secondary-button" style={{ fontSize: '12px', padding: '4px 8px', minHeight: 'auto' }} onClick={() => handleSave('md')}>保存为 MD</button>
            <button className="secondary-button" style={{ fontSize: '12px', padding: '4px 8px', minHeight: 'auto' }} onClick={() => handleSave('pdf')}>保存为 PDF</button>
          </div>
        )}
      </div>
      <pre className="answer-card-body">{props.body}</pre>
    </article>
  );
}
