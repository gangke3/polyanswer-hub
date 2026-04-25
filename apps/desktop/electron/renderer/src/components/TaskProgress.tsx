interface TaskProgressProps {
  title: string;
  description: string;
}

export function TaskProgress(props: TaskProgressProps) {
  return (
    <section className="panel progress-panel">
      <strong>{props.title}</strong>
      <span>{props.description}</span>
    </section>
  );
}
