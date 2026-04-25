interface ProviderStatusCardProps {
  name: string;
  status: string;
}

export function ProviderStatusCard(props: ProviderStatusCardProps) {
  return (
    <div className="status-card">
      <strong>{props.name}</strong>
      <span>{props.status}</span>
    </div>
  );
}
