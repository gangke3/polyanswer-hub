import type { ProviderMeta } from "@multi-ai/shared";

interface ProviderSelectorProps {
  providers: ProviderMeta[];
  selectedProviderIds: string[];
  onToggle: (providerId: string) => void;
}

export function ProviderSelector(props: ProviderSelectorProps) {
  return (
    <div className="provider-selector">
      {props.providers.map((provider) => (
        <label className="provider-chip" key={provider.id}>
          <input
            type="checkbox"
            checked={props.selectedProviderIds.includes(provider.id)}
            onChange={() => props.onToggle(provider.id)}
          />
          <span>{provider.name}</span>
        </label>
      ))}
    </div>
  );
}
