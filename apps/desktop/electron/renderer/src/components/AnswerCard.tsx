interface AnswerCardProps {
  title: string;
  status: string;
  body: string;
}

export function AnswerCard(props: AnswerCardProps) {
  const isError = props.status !== "completed";

  return (
    <article className={`answer-card${isError ? " answer-card-error" : ""}`}>
      <div className="answer-card-header">
        <h3>{props.title}</h3>
        <span className="pill">{props.status}</span>
      </div>
      <pre className="answer-card-body">{props.body}</pre>
    </article>
  );
}
