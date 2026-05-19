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

  return (
    <article className={`answer-card${isError ? " answer-card-error" : ""}`}>
      <div className="answer-card-header">
        <h3>{props.title}</h3>
        <span className="pill">{props.statusText ?? displayStatus(props.status)}</span>
      </div>
      <pre className="answer-card-body">{props.body}</pre>
    </article>
  );
}
