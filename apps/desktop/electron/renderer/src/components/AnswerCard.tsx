import { useState } from "react";

interface AnswerCardProps {
  title: string;
  status: string;
  statusText?: string;
  body: string;
  onEdit?: (newBody: string) => void;
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.body);

  // Sync draft when body changes externally (e.g. after re-summarize or parent update)
  if (!editing && draft !== props.body) {
    setDraft(props.body);
  }

  const handleSave = async (format: 'txt' | 'md' | 'pdf') => {
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
      try {
        await window.multiAiApi.exportPdfContent({ title: props.title, body: text });
      } catch (err) {
        console.error("PDF export failed:", err);
      }
    }
  };

  function handleStartEdit() {
    setDraft(props.body);
    setEditing(true);
  }

  function handleSaveEdit() {
    setEditing(false);
    if (draft !== props.body && props.onEdit) {
      props.onEdit(draft);
    }
  }

  function handleCancelEdit() {
    setDraft(props.body);
    setEditing(false);
  }

  const buttonStyle = { fontSize: '12px', padding: '4px 8px', minHeight: 'auto' } as const;

  return (
    <article className={`answer-card${isError ? " answer-card-error" : ""}`}>
      <div className="answer-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3>{props.title}</h3>
          <span className="pill">{props.statusText ?? displayStatus(props.status)}</span>
          {editing && <span className="pill" style={{ background: '#dbeafe', color: '#1e40af' }}>编辑中</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button className="secondary-button" style={{ ...buttonStyle, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }} onClick={handleSaveEdit}>保存修改</button>
              <button className="secondary-button" style={buttonStyle} onClick={handleCancelEdit}>取消</button>
            </>
          ) : (
            <>
              {props.onEdit && (
                <button className="secondary-button" style={{ ...buttonStyle, fontWeight: 600 }} onClick={handleStartEdit}>编辑</button>
              )}
              {!isError && (
                <>
                  <button className="secondary-button" style={buttonStyle} onClick={() => handleSave('txt')}>TXT</button>
                  <button className="secondary-button" style={buttonStyle} onClick={() => handleSave('md')}>MD</button>
                  <button className="secondary-button" style={buttonStyle} onClick={() => handleSave('pdf')}>PDF</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {editing ? (
        <textarea
          className="answer-card-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            width: '100%',
            minHeight: '260px',
            maxHeight: '600px',
            resize: 'vertical',
            fontFamily: 'inherit',
            fontSize: '14px',
            lineHeight: '1.7',
            padding: '12px 14px',
            border: '2px solid #3b82f6',
            borderRadius: '8px',
            outline: 'none',
            background: '#f8fafc',
            color: '#1a1a1a',
            whiteSpace: 'pre-wrap',
            overflowY: 'auto'
          }}
        />
      ) : (
        <pre className="answer-card-body">{props.body}</pre>
      )}
    </article>
  );
}
